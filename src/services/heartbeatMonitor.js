import { eq, and, lt, ne } from 'drizzle-orm';
import { db } from '../config/database.js';
import { devices, deviceHeartbeats, incidents } from '../db/schema.js';
import { config } from '../config/env.js';
import { emitHeartbeatUpdate, emitDeviceStatusChange, emitIncidentAlert } from './socketService.js';

let monitorIntervalId = null;

/**
 * Registra un heartbeat recibido desde una app Android y actualiza las métricas vitales
 * @param {object} device Dispositivo emisor
 * @param {object} data Datos de batería, carga, temperaturas y conectividad
 */
export async function recordHeartbeat(device, data) {
  const {
    batteryLevel = 100,
    isCharging = false,
    batteryTemp = 25.0,
    cpuTemp = 30.0,
    wifiSsid = null,
    signalStrength = null,
    storageFreeMb = null,
    memoryFreeMb = null,
    latitude = null,
    longitude = null,
    altitude = null,
  } = data;

  const now = new Date();

  // 1. Insertar registro en device_heartbeats
  const [heartbeatRecord] = await db
    .insert(deviceHeartbeats)
    .values({
      deviceId: device.id,
      batteryLevel,
      isCharging,
      batteryTemp,
      cpuTemp,
      wifiSsid,
      signalStrength,
      storageFreeMb,
      memoryFreeMb,
      isOnline: true,
      receivedAt: now,
    })
    .returning();

  // 2. Determinar estado de salud del dispositivo
  let newStatus = 'online';
  if (batteryLevel <= 15 && !isCharging) {
    newStatus = 'warning';
  }
  if (batteryTemp >= 52 || cpuTemp >= 60) {
    newStatus = 'warning';
  }

  const updateFields = {
    status: newStatus,
    lastHeartbeatAt: now,
    lastBatteryLevel: batteryLevel,
    isCharging,
    lastBatteryTemp: batteryTemp,
    lastCpuTemp: cpuTemp,
    updatedAt: now,
  };

  if (latitude !== null && longitude !== null) {
    updateFields.lastLatitude = latitude;
    updateFields.lastLongitude = longitude;
  }
  if (altitude !== null) {
    updateFields.lastAltitude = altitude;
  }

  await db.update(devices).set(updateFields).where(eq(devices.id, device.id));

  // 3. Si el dispositivo estaba offline previamente, avisar cambio a online
  if (device.status === 'offline') {
    emitDeviceStatusChange(device.id, newStatus, {
      deviceName: device.name,
      batteryLevel,
      isCharging,
    });
  }

  // 4. Emitir evento de heartbeat en tiempo real a clientes conectados
  emitHeartbeatUpdate(device.id, {
    heartbeatId: heartbeatRecord.id,
    batteryLevel,
    isCharging,
    batteryTemp,
    cpuTemp,
    wifiSsid,
    signalStrength,
    status: newStatus,
    receivedAt: now,
  });

  // 5. Alerta de batería crítica (< 10% y sin cargador conectado)
  if (batteryLevel < 10 && !isCharging) {
    const [batteryIncident] = await db
      .insert(incidents)
      .values({
        deviceId: device.id,
        incidentType: 'bateria_critica',
        severity: 'alta',
        status: 'activa',
        title: `⚠️ Batería Crítica (${device.name})`,
        description: `El dispositivo tiene ${batteryLevel}% de batería y no está conectado a una fuente de energía.`,
        latitude: device.lastLatitude,
        longitude: device.lastLongitude,
        detectedAt: now,
        sensorSnapshot: { batteryLevel, isCharging, batteryTemp, cpuTemp },
      })
      .returning();

    emitIncidentAlert({
      ...batteryIncident,
      device: { id: device.id, name: device.name, model: device.model },
    });
  }

  return heartbeatRecord;
}

/**
 * Tarea periódica de fondo que detecta dispositivos que dejaron de enviar heartbeats
 * y los marca como 'offline'.
 */
export async function checkOfflineDevices() {
  try {
    const cutoffDate = new Date(Date.now() - config.heartbeatTimeoutSeconds * 1000);

    // Buscar dispositivos que no estén ya offline pero cuyo último heartbeat sea anterior al umbral
    const staleDevices = await db
      .select()
      .from(devices)
      .where(
        and(
          ne(devices.status, 'offline'),
          lt(devices.lastHeartbeatAt, cutoffDate)
        )
      );

    for (const dev of staleDevices) {
      await db
        .update(devices)
        .set({ status: 'offline', updatedAt: new Date() })
        .where(eq(devices.id, dev.id));

      console.log(`📴 Dispositivo ${dev.name} marcado como OFFLINE (sin heartbeat por más de ${config.heartbeatTimeoutSeconds}s).`);

      emitDeviceStatusChange(dev.id, 'offline', {
        deviceName: dev.name,
        lastHeartbeatAt: dev.lastHeartbeatAt,
        timeoutSeconds: config.heartbeatTimeoutSeconds,
      });
    }
  } catch (err) {
    console.error('Error al verificar dispositivos offline:', err.message);
  }
}

/**
 * Inicia el monitor en segundo plano
 */
export function startHeartbeatMonitor() {
  if (monitorIntervalId) return;

  // Ejecutar comprobación cada 15 segundos
  monitorIntervalId = setInterval(checkOfflineDevices, 15000);
  console.log(`💓 Monitor de Heartbeats iniciado (comprobación cada 15s, umbral timeout: ${config.heartbeatTimeoutSeconds}s).`);
}

/**
 * Detiene el monitor en segundo plano
 */
export function stopHeartbeatMonitor() {
  if (monitorIntervalId) {
    clearInterval(monitorIntervalId);
    monitorIntervalId = null;
  }
}

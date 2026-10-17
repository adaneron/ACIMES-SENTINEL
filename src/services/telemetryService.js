import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { devices, deviceTelemetries, incidents } from '../db/schema.js';
import { config } from '../config/env.js';
import { emitIncidentAlert, emitTelemetryUpdate } from './socketService.js';
import { dispatchIncidentAlertToContacts } from './telegramService.js';
import { getSeismicConsensusSettings } from './systemSettingsService.js';

// Registro en memoria de eventos sísmicos recientes para cálculo de consenso multi-nodo
const recentSeismicEvents = [];

/**
 * Calcula la magnitud escalar de un vector tridimensional de aceleración
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {number} Magnitud resultante en m/s²
 */
export function calculateMagnitude(x, y, z) {
  return Math.sqrt((x || 0) ** 2 + (y || 0) ** 2 + (z || 0) ** 2);
}

/**
 * Procesa la telemetría enviada por un dispositivo móvil Android (acelerómetro y GPS)
 * @param {object} device Registro del dispositivo en BD
 * @param {object} telemetryPayload Datos de acelerómetro y GPS
 * @returns {Promise<{telemetry: object, incident: object|null}>}
 */
export async function processTelemetry(device, telemetryPayload) {
  const {
    accelX = 0,
    accelY = 0,
    accelZ = 9.81,
    explicitMagnitude = null,
    forceSeismicAlert = false,
    latitude = device.lastLatitude,
    longitude = device.lastLongitude,
    altitude = device.lastAltitude,
    accuracy = null,
    speed = null,
    rawData = {},
  } = telemetryPayload;

  const computedMag = calculateMagnitude(accelX, accelY, accelZ);
  const magnitude = explicitMagnitude && explicitMagnitude > 0 ? explicitMagnitude : computedMag;
  
  // Detección de sismo por exceso de aceleración respecto al umbral calibrado del dispositivo o global
  const effectiveThreshold = device.movementThreshold != null ? device.movementThreshold : config.seismicAccelThreshold;
  const isSeismicAlert = forceSeismicAlert || magnitude >= effectiveThreshold;


  // 1. Guardar registro en la tabla de telemetría
  const [telemetryRecord] = await db
    .insert(deviceTelemetries)
    .values({
      deviceId: device.id,
      accelX,
      accelY,
      accelZ,
      accelMagnitude: parseFloat(magnitude.toFixed(3)),
      isSeismicAlert,
      latitude,
      longitude,
      altitude,
      accuracy,
      speed,
      rawData,
      capturedAt: telemetryPayload.timestamp ? new Date(telemetryPayload.timestamp) : new Date(),
    })
    .returning();

  // 2. Actualizar último estado y coordenadas en la tabla de dispositivos
  await db
    .update(devices)
    .set({
      lastLatitude: latitude,
      lastLongitude: longitude,
      lastAltitude: altitude,
      status: 'online',
      updatedAt: new Date(),
    })
    .where(eq(devices.id, device.id));

  let createdIncident = null;

  // 3. Si se detecta rango de movimiento de sismo y el dispositivo está autorizado, procesar consenso
  if (isSeismicAlert && device?.isAuthorized) {
    const consensusSettings = await getSeismicConsensusSettings();
    const windowMs = (consensusSettings.windowSeconds || 15) * 1000;
    const now = Date.now();

    // Limpiar eventos fuera de la ventana de coincidencia
    while (recentSeismicEvents.length > 0 && (now - recentSeismicEvents[0].timestamp) > windowMs) {
      recentSeismicEvents.shift();
    }

    // Agregar evento actual al buffer
    recentSeismicEvents.push({
      deviceId: device.id,
      deviceName: device.name,
      magnitude,
      timestamp: now,
    });

    // Identificar nodos únicos que han detectado sismo dentro de la ventana
    const distinctDeviceIds = [...new Set(recentSeismicEvents.map((e) => e.deviceId))];
    const distinctCount = distinctDeviceIds.length;
    const minRequired = consensusSettings.minDevices || 1;
    const hasConsensus = distinctCount >= minRequired;

    let severity = 'media';
    if (magnitude >= 22.0) {
      severity = 'critica';
    } else if (magnitude >= 17.0) {
      severity = 'alta';
    }

    const isMuted = Boolean(device.isMuted) || !hasConsensus;

    let title = '';
    let description = '';
    let status = 'activa';

    if (hasConsensus) {
      title = minRequired > 1
        ? `🚨 Alerta Sísmica Confirmada por Consenso (${distinctCount} Nodos)`
        : `🚨 Alerta Sísmica: Sacudida Detectada (${device.name})`;
      description = minRequired > 1
        ? `Consenso sísmico verificado entre ${distinctCount} dispositivos simultáneos en ventana de ${consensusSettings.windowSeconds}s. Sacudida máxima: ${magnitude.toFixed(2)} m/s² (umbral: ${effectiveThreshold} m/s²).`
        : `El acelerómetro del dispositivo registró un pico de movimiento telúrico de ${magnitude.toFixed(2)} m/s² (umbral: ${effectiveThreshold} m/s²).`;
    } else {
      // Pre-alerta silenciosa a la espera de más nodos para evitar falsos positivos
      severity = 'baja';
      status = 'en_proceso';
      title = `⚠️ Pre-Alerta Sísmica: En Espera de Consenso (${distinctCount}/${minRequired} Nodos)`;
      description = `Movimiento telúrico de ${magnitude.toFixed(2)} m/s² registrado por nodo "${device.name}". Esperando confirmación de ${minRequired - distinctCount} nodo(s) adicional(es) en ${consensusSettings.windowSeconds}s para alerta general.`;
    }

    const [incidentRecord] = await db
      .insert(incidents)
      .values({
        deviceId: device.id,
        incidentType: 'sismo',
        severity,
        status,
        isMuted,
        title,
        description,
        latitude,
        longitude,
        detectedAt: new Date(),
        sensorSnapshot: {
          accelX,
          accelY,
          accelZ,
          magnitude: parseFloat(magnitude.toFixed(3)),
          threshold: effectiveThreshold,
          accuracy,
          speed,
          consensus: {
            required: minRequired,
            activeCount: distinctCount,
            hasConsensus,
            windowSeconds: consensusSettings.windowSeconds,
          },
        },
      })
      .returning();

    createdIncident = {
      ...incidentRecord,
      device: {
        id: device.id,
        name: device.name,
        model: device.model,
      },
      isMuted,
    };

    // Emitir alerta en tiempo real a todos los clientes WebSockets
    emitIncidentAlert(createdIncident);

    // Solo despachar por Telegram si se cumplió el consenso y no está silenciado
    if (hasConsensus && !Boolean(device.isMuted)) {
      dispatchIncidentAlertToContacts(createdIncident).catch((err) =>
        console.error('Error despachando alerta sísmica confirmada por Telegram:', err.message)
      );
    }
  }

  // 4. Emitir actualización de telemetría en tiempo real
  emitTelemetryUpdate(device.id, {
    telemetryId: telemetryRecord.id,
    accelX,
    accelY,
    accelZ,
    magnitude: parseFloat(magnitude.toFixed(3)),
    isSeismicAlert,
    latitude,
    longitude,
    capturedAt: telemetryRecord.capturedAt,
  });

  return {
    telemetry: telemetryRecord,
    incident: createdIncident,
  };
}

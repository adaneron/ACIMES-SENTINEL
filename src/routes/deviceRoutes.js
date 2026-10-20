import express from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { eq, desc, ilike, and, ne } from 'drizzle-orm';
import { db } from '../config/database.js';
import { devices, deviceTelemetries, deviceHeartbeats, cameraEvidences } from '../db/schema.js';
import { exec } from 'child_process';
import { requireAdmin } from '../middlewares/auth.js';
import { authenticateDevice } from '../middlewares/deviceAuth.js';
import { config } from '../config/env.js';
import { getIO } from '../services/socketService.js';
import { createAuditLog } from '../services/auditService.js';
import { queueDeviceCommand, popDeviceCommands } from '../services/commandService.js';

const router = express.Router();

const registerNodeSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  deviceIdentifier: z.string().min(3).optional(),
  identifier: z.string().min(3).optional(),
  model: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
  altitude: z.coerce.number().optional().nullable(),
}).transform((data) => ({
  ...data,
  deviceIdentifier: data.deviceIdentifier || data.identifier,
})).refine((data) => Boolean(data.deviceIdentifier), {
  message: 'El identificador debe tener al menos 3 caracteres',
  path: ['deviceIdentifier'],
});


const createDeviceSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  deviceIdentifier: z.string().min(3, 'El identificador debe tener al menos 3 caracteres'),
  model: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
});

const updateDeviceSchema = z.object({
  name: z.string().min(2).optional(),
  model: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
});

/**
 * GET /api/devices
 * Lista todos los dispositivos registrados con su estado de conexión en tiempo real
 * Accesible para administradores y usuarios regulares (público)
 */
router.get('/', async (req, res, next) => {
  try {
    const allDevices = await db.select().from(devices).orderBy(desc(devices.createdAt));
    const now = Date.now();
    const timeoutMs = config.heartbeatTimeoutSeconds * 1000;

    // Obtener la evidencia fotográfica más reciente para cada dispositivo
    const allEvidences = await db
      .select({
        id: cameraEvidences.id,
        deviceId: cameraEvidences.deviceId,
        filePath: cameraEvidences.filePath,
        originalFilename: cameraEvidences.originalFilename,
        fileSize: cameraEvidences.fileSize,
        mimeType: cameraEvidences.mimeType,
        capturedAt: cameraEvidences.capturedAt,
        floodDetected: cameraEvidences.floodDetected,
        floodConfidence: cameraEvidences.floodConfidence,
        waterLevelCm: cameraEvidences.waterLevelCm,
        ocrStatus: cameraEvidences.ocrStatus,
        latitude: cameraEvidences.latitude,
        longitude: cameraEvidences.longitude,
      })
      .from(cameraEvidences)
      .orderBy(desc(cameraEvidences.capturedAt));

    const latestEvidenceByDeviceId = new Map();
    for (const ev of allEvidences) {
      if (!latestEvidenceByDeviceId.has(ev.deviceId)) {
        latestEvidenceByDeviceId.set(ev.deviceId, ev);
      }
    }

    const enrichedDevices = allDevices.map((dev) => {
      const lastSeenMs = dev.lastHeartbeatAt ? new Date(dev.lastHeartbeatAt).getTime() : 0;
      const isOnline = lastSeenMs > 0 && (now - lastSeenMs) <= timeoutMs;
      const secondsSinceLastSeen = lastSeenMs > 0 ? Math.floor((now - lastSeenMs) / 1000) : null;

      let computedStatus = 'offline';
      if (!dev.isAuthorized) {
        computedStatus = 'pending_authorization';
      } else if (isOnline) {
        computedStatus = dev.status === 'warning' ? 'warning' : 'online';
      }

      return {
        id: dev.id,
        name: dev.name,
        deviceIdentifier: dev.deviceIdentifier,
        apiKey: dev.apiKey,
        model: dev.model,
        osVersion: dev.osVersion,
        appVersion: dev.appVersion,
        status: computedStatus,
        isAuthorized: dev.isAuthorized,
        authRequestedAt: dev.authRequestedAt,
        authorizedAt: dev.authorizedAt,
        isOnline: dev.isAuthorized ? isOnline : false,
        secondsSinceLastSeen,
        lastHeartbeatAt: dev.lastHeartbeatAt,
        latestEvidence: latestEvidenceByDeviceId.get(dev.id) || null,
        location: {
          latitude: dev.lastLatitude,
          longitude: dev.lastLongitude,
          altitude: dev.lastAltitude,
        },
        telemetrySummary: {
          batteryLevel: dev.lastBatteryLevel,
          isCharging: dev.isCharging,
          batteryTemp: dev.lastBatteryTemp,
          cpuTemp: dev.lastCpuTemp,
        },
        movementThreshold: dev.movementThreshold ?? 14.5,
        photoIntervalMinutes: dev.photoIntervalMinutes ?? 3,
        isMuted: dev.isMuted ?? false,
        createdAt: dev.createdAt,
      };
    });

    return res.json({
      success: true,
      count: enrichedDevices.length,
      devices: enrichedDevices,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/devices/commands
 * Polling rápido para nodos Android autorizados
 */
router.get('/commands', authenticateDevice, (req, res) => {
  const commands = popDeviceCommands(req.device.id);
  res.json({
    success: true,
    commands,
  });
});

/**
 * GET /api/devices/:id
 * Obtiene el detalle de un dispositivo, incluyendo sus últimas telemetrías y heartbeats
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [device] = await db.select().from(devices).where(eq(devices.id, id));

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo no encontrado.',
      });
    }

    // Última evidencia fotográfica
    const [latestEvidence] = await db
      .select()
      .from(cameraEvidences)
      .where(eq(cameraEvidences.deviceId, id))
      .orderBy(desc(cameraEvidences.capturedAt))
      .limit(1);

    // Últimos 15 registros de telemetría
    const recentTelemetries = await db
      .select()
      .from(deviceTelemetries)
      .where(eq(deviceTelemetries.deviceId, id))
      .orderBy(desc(deviceTelemetries.capturedAt))
      .limit(15);

    // Últimos 15 registros de heartbeat
    const recentHeartbeats = await db
      .select()
      .from(deviceHeartbeats)
      .where(eq(deviceHeartbeats.deviceId, id))
      .orderBy(desc(deviceHeartbeats.receivedAt))
      .limit(15);

    return res.json({
      success: true,
      device: {
        ...device,
        latestEvidence: latestEvidence || null,
        recentTelemetries,
        recentHeartbeats,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/devices
 * Registra un nuevo dispositivo móvil (Solo Administradores)
 */
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const data = createDeviceSchema.parse(req.body);
    const trimmedName = data.name.trim();
    const trimmedIdentifier = data.deviceIdentifier.trim();

    // Validar nombre único
    const [existingName] = await db
      .select({ id: devices.id })
      .from(devices)
      .where(ilike(devices.name, trimmedName));
    if (existingName) {
      return res.status(409).json({
        success: false,
        error: `El nombre de dispositivo "${trimmedName}" ya está registrado. Por favor elija un nombre único.`,
      });
    }

    // Validar identificador único
    const [existingIdentifier] = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.deviceIdentifier, trimmedIdentifier));
    if (existingIdentifier) {
      return res.status(409).json({
        success: false,
        error: `El identificador de hardware "${trimmedIdentifier}" ya está en uso.`,
      });
    }

    // Generar clave de API única para el dispositivo
    const apiKey = `dev_token_${crypto.randomBytes(16).toString('hex')}`;

    const [newDevice] = await db
      .insert(devices)
      .values({
        name: trimmedName,
        deviceIdentifier: trimmedIdentifier,
        apiKey,
        model: data.model || 'Android Device',
        osVersion: data.osVersion || 'Android',
        appVersion: data.appVersion || '1.0.0',
        status: 'offline',
      })
      .returning();

    return res.status(201).json({
      success: true,
      message: 'Dispositivo registrado exitosamente.',
      device: newDevice,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/devices/:id
 * Actualiza la información de un dispositivo (Solo Administradores)
 */
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = updateDeviceSchema.parse(req.body);

    if (data.name) {
      const trimmedName = data.name.trim();
      const [existingName] = await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(ilike(devices.name, trimmedName), ne(devices.id, id)));

      if (existingName) {
        return res.status(409).json({
          success: false,
          error: `El nombre de dispositivo "${trimmedName}" ya está registrado por otro nodo.`,
        });
      }
      data.name = trimmedName;
    }

    const [updated] = await db
      .update(devices)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo no encontrado.',
      });
    }

    return res.json({
      success: true,
      message: 'Dispositivo actualizado.',
      device: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/devices/:id
 * Elimina un dispositivo (Solo Administradores)
 */
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [deleted] = await db.delete(devices).where(eq(devices.id, id)).returning();

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo no encontrado.',
      });
    }

    try {
      await createAuditLog({
        action: 'device_deleted',
        category: 'devices',
        severity: 'warning',
        userId: req.user?.id || null,
        description: `El administrador "${req.user?.name || 'Admin'}" eliminó el nodo "${deleted.name}" (${deleted.deviceIdentifier}). Deberá solicitar autorización nuevamente.`,
        metadata: {
          deletedDeviceId: deleted.id,
          name: deleted.name,
          deviceIdentifier: deleted.deviceIdentifier,
          model: deleted.model,
        },
      });
    } catch (auditErr) {
      console.warn('⚠️ No se pudo registrar auditoría de eliminación de nodo:', auditErr.message);
    }

    getIO()?.emit('device:deleted', {
      deviceId: deleted.id,
      name: deleted.name,
      deviceIdentifier: deleted.deviceIdentifier,
    });
    getIO()?.emit('node:deleted', {
      deviceId: deleted.id,
      deviceIdentifier: deleted.deviceIdentifier,
    });

    return res.json({
      success: true,
      message: `Nodo "${deleted.name}" eliminado correctamente. Deberá solicitar autorización nuevamente.`,
      device: deleted,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/devices/:id/regenerate-key
 * Regenera la clave de API para un dispositivo (Solo Administradores)
 */
router.post('/:id/regenerate-key', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const newApiKey = `dev_token_${crypto.randomBytes(16).toString('hex')}`;

    const [updated] = await db
      .update(devices)
      .set({
        apiKey: newApiKey,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo no encontrado.',
      });
    }

    return res.json({
      success: true,
      message: 'Clave de API regenerada exitosamente.',
      apiKey: newApiKey,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/devices/register-node
 * Endpoint público que invoca la app Android Centinela para solicitar su registro como nodo
 */
router.post('/register-node', async (req, res, next) => {
  try {
    const data = registerNodeSchema.parse(req.body);
    const trimmedName = data.name.trim();

    // 1. Validar unicidad del nombre: rechazar si otro dispositivo ya tiene este nombre
    const [existingWithSameName] = await db
      .select({ id: devices.id, deviceIdentifier: devices.deviceIdentifier, name: devices.name })
      .from(devices)
      .where(ilike(devices.name, trimmedName));

    if (existingWithSameName && existingWithSameName.deviceIdentifier !== data.deviceIdentifier) {
      return res.status(409).json({
        success: false,
        error: `El nombre de nodo "${trimmedName}" ya está registrado por otro dispositivo. Por favor elija un nombre diferente.`,
      });
    }

    // 2. Verificar si ya existe este identificador de hardware
    const [existing] = await db
      .select()
      .from(devices)
      .where(eq(devices.deviceIdentifier, data.deviceIdentifier));

    if (existing) {
      if (existing.isAuthorized) {
        return res.json({
          success: true,
          isAuthorized: true,
          status: 'authorized',
          message: 'Nodo ya autorizado previamente.',
          apiKey: existing.apiKey,
          deviceId: existing.id,
          name: existing.name,
        });
      }

      // Si ya existía pero seguía pendiente, actualizar datos y notificar al admin
      const [updated] = await db
        .update(devices)
        .set({
          name: trimmedName,
          model: data.model || existing.model,
          osVersion: data.osVersion || existing.osVersion,
          appVersion: data.appVersion || existing.appVersion,
          authRequestedAt: new Date(),
          lastLatitude: data.latitude ?? existing.lastLatitude,
          lastLongitude: data.longitude ?? existing.lastLongitude,
          updatedAt: new Date(),
        })
        .where(eq(devices.id, existing.id))
        .returning();

      getIO()?.emit('node:registration_request', {
        id: updated.id,
        name: updated.name,
        deviceIdentifier: updated.deviceIdentifier,
        model: updated.model,
        requestedAt: new Date().toISOString(),
      });

      return res.json({
        success: true,
        isAuthorized: false,
        status: 'pending_authorization',
        message: 'Solicitud renovada. Esperando aprobación del Administrador en el panel.',
        deviceId: updated.id,
      });
    }

    // Registro nuevo de nodo (requiere aprobación del Administrador)
    const apiKey = `dev_token_${crypto.randomBytes(16).toString('hex')}`;
    const [newDevice] = await db
      .insert(devices)
      .values({
        name: trimmedName,
        deviceIdentifier: data.deviceIdentifier,
        apiKey,
        model: data.model || 'Android Centinela',
        osVersion: data.osVersion || 'Android',
        appVersion: data.appVersion || '1.0.0',
        status: 'pending_authorization',
        isAuthorized: false,
        authRequestedAt: new Date(),
        lastLatitude: data.latitude,
        lastLongitude: data.longitude,
        lastAltitude: data.altitude,
      })
      .returning();

    // Notificar en tiempo real al panel administrativo
    getIO()?.emit('node:registration_request', {
      id: newDevice.id,
      name: newDevice.name,
      deviceIdentifier: newDevice.deviceIdentifier,
      model: newDevice.model,
      requestedAt: new Date().toISOString(),
    });

    return res.status(201).json({
      success: true,
      isAuthorized: false,
      status: 'pending_authorization',
      message: 'Nodo registrado con éxito. Esperando autorización del Administrador.',
      deviceId: newDevice.id,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/devices/node-status/:identifier
 * Permite a la app Centinela comprobar si el nodo ya fue autorizado por el administrador
 */
router.get('/node-status/:identifier', async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const [device] = await db
      .select()
      .from(devices)
      .where(eq(devices.deviceIdentifier, identifier));

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Nodo no encontrado en el sistema.',
      });
    }

    return res.json({
      success: true,
      deviceId: device.id,
      name: device.name,
      isAuthorized: device.isAuthorized,
      status: device.status,
      apiKey: device.isAuthorized ? device.apiKey : null,
      authorizedAt: device.authorizedAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/devices/:id/authorize
 * Autoriza un nodo Centinela para conectarse al sistema (Solo Administradores)
 */
router.patch('/:id/authorize', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [updated] = await db
      .update(devices)
      .set({
        isAuthorized: true,
        status: 'online',
        authorizedAt: new Date(),
        authorizedById: req.user.id,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo no encontrado.',
      });
    }

    // Emitir evento a WebSockets informando a la app que fue autorizada
    getIO()?.emit('node:authorized', {
      deviceId: updated.id,
      deviceIdentifier: updated.deviceIdentifier,
      apiKey: updated.apiKey,
      name: updated.name,
    });

    return res.json({
      success: true,
      message: `Nodo "${updated.name}" autorizado exitosamente.`,
      device: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/devices/:id/reject
 * Rechaza o desautoriza un nodo (Solo Administradores)
 */
router.patch('/:id/reject', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [updated] = await db
      .update(devices)
      .set({
        isAuthorized: false,
        status: 'rejected',
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo no encontrado.',
      });
    }

    getIO()?.emit('node:rejected', {
      deviceId: updated.id,
      deviceIdentifier: updated.deviceIdentifier,
    });

    return res.json({
      success: true,
      message: `Nodo "${updated.name}" desautorizado/rechazado.`,
      device: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/devices/:id/threshold
 * Calibra el umbral de movimiento/sismo (m/s²) para un dispositivo específico (Solo Administradores)
 */
router.patch('/:id/threshold', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const thresholdSchema = z.object({
      threshold: z.coerce.number().min(1.0, 'El umbral mínimo es 1.0 m/s²').max(50.0, 'El umbral máximo es 50.0 m/s²').optional(),
      movementThreshold: z.coerce.number().min(1.0, 'El umbral mínimo es 1.0 m/s²').max(50.0, 'El umbral máximo es 50.0 m/s²').optional(),
    }).refine((data) => data.threshold != null || data.movementThreshold != null, {
      message: 'Debe proporcionar threshold o movementThreshold',
    }).transform((data) => ({
      movementThreshold: data.movementThreshold != null ? data.movementThreshold : data.threshold,
    }));
    const { movementThreshold } = thresholdSchema.parse(req.body);

    const [target] = await db.select().from(devices).where(eq(devices.id, id));
    if (!target) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo no encontrado.',
      });
    }

    const [updated] = await db
      .update(devices)
      .set({
        movementThreshold,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id))
      .returning();

    await createAuditLog({
      action: 'device_threshold_calibrated',
      category: 'devices',
      severity: 'info',
      userId: req.user.id,
      description: `El administrador "${req.user.name}" calibró el umbral de aceleración de "${target.name}" a ${movementThreshold} m/s².`,
      metadata: { deviceId: id, previousThreshold: target.movementThreshold, newThreshold: movementThreshold },
    });

    getIO()?.emit('device:threshold_updated', {
      deviceId: updated.id,
      movementThreshold: updated.movementThreshold,
    });

    return res.json({
      success: true,
      message: `Umbral de movimiento calibrado a ${movementThreshold} m/s² para ${target.name}.`,
      device: updated,
    });
  } catch (error) {
    next(error);
  }
});


/**
 * POST /api/devices/:id/capture-photo
 * Solicita una captura fotográfica remota e inmediata al nodo Android (Solo Administradores)
 */
router.post('/:id/capture-photo', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [target] = await db.select().from(devices).where(eq(devices.id, id));
    if (!target) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo no encontrado.',
      });
    }

    // Encolar comando remoto para polling HTTP/WebSocket
    queueDeviceCommand(target.id, 'capture_photo');

    // Intentar disparo local por ADB si el dispositivo está conectado por USB (latencia instantánea)
    try {
      exec('adb shell am broadcast -a com.example.centinela.action.TAKE_PHOTO', () => {});
    } catch {
      // Dispositivo no conectado por ADB o no disponible en este host
    }

    await createAuditLog({
      action: 'device_manual_capture_requested',
      category: 'devices',
      severity: 'info',
      userId: req.user.id,
      description: `El administrador "${req.user.name}" solicitó una captura remota de fotografía al nodo "${target.name}".`,
      metadata: { deviceId: id, deviceIdentifier: target.deviceIdentifier },
    });

    return res.json({
      success: true,
      message: `Orden de captura fotográfica enviada al nodo "${target.name}".`,
      device: {
        id: target.id,
        name: target.name,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/devices/:id/photo-interval
 * Configura el intervalo de captura periódica de fotos en minutos (Solo Administradores)
 */
router.patch('/:id/photo-interval', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const intervalSchema = z.object({
      intervalMinutes: z.coerce.number().int().min(1, 'El intervalo mínimo es de 1 minuto').max(1440, 'El intervalo máximo es de 1440 minutos (24h)').optional(),
      photoIntervalMinutes: z.coerce.number().int().min(1, 'El intervalo mínimo es de 1 minuto').max(1440, 'El intervalo máximo es de 1440 minutos (24h)').optional(),
    }).refine((data) => data.intervalMinutes != null || data.photoIntervalMinutes != null, {
      message: 'Debe proporcionar intervalMinutes o photoIntervalMinutes',
    }).transform((data) => ({
      photoIntervalMinutes: data.photoIntervalMinutes != null ? data.photoIntervalMinutes : data.intervalMinutes,
    }));

    const { photoIntervalMinutes } = intervalSchema.parse(req.body);

    const [target] = await db.select().from(devices).where(eq(devices.id, id));
    if (!target) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo no encontrado.',
      });
    }

    const [updated] = await db
      .update(devices)
      .set({
        photoIntervalMinutes,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id))
      .returning();

    await createAuditLog({
      action: 'device_photo_interval_calibrated',
      category: 'devices',
      severity: 'info',
      userId: req.user.id,
      description: `El administrador "${req.user.name}" configuró el intervalo de captura de "${target.name}" a cada ${photoIntervalMinutes} minuto(s).`,
      metadata: { deviceId: id, previousInterval: target.photoIntervalMinutes, newInterval: photoIntervalMinutes },
    });

    getIO()?.emit('device:config_updated', {
      deviceId: updated.id,
      photoIntervalMinutes: updated.photoIntervalMinutes,
      movementThreshold: updated.movementThreshold,
    });

    return res.json({
      success: true,
      message: `Intervalo de captura configurado a cada ${photoIntervalMinutes} minuto(s) para "${target.name}".`,
      device: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/devices/self/mute
 * Permite que el nodo Android Centinela silencie o reanude sus transmisiones directamente
 */
router.patch('/self/mute', authenticateDevice, async (req, res, next) => {
  try {
    const muteSchema = z.object({
      isMuted: z.boolean().optional(),
    });
    const body = muteSchema.parse(req.body || {});
    const device = req.device;

    const newMutedState = body.isMuted !== undefined ? body.isMuted : !device.isMuted;

    const [updated] = await db
      .update(devices)
      .set({
        isMuted: newMutedState,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, device.id))
      .returning();

    await createAuditLog({
      action: newMutedState ? 'device_self_muted' : 'device_self_unmuted',
      category: 'devices',
      severity: 'info',
      deviceId: device.id,
      description: `El nodo "${device.name}" ${newMutedState ? 'silenció/pausó' : 'reanudó'} la comunicación de alertas directamente desde el dispositivo móvil.`,
      metadata: { deviceId: device.id, isMuted: newMutedState },
    });

    getIO()?.emit('device:mute_toggled', {
      deviceId: updated.id,
      isMuted: updated.isMuted,
      name: updated.name,
    });

    return res.json({
      success: true,
      message: updated.isMuted
        ? `Nodo "${device.name}" silenciado. No disparará alertas generales ni sirenas.`
        : `Transmisión del nodo "${device.name}" reanudada con éxito.`,
      isMuted: updated.isMuted,
      device: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/devices/:id/mute
 * Alterna o fija el estado de silencio/pausa de un nodo desde el portal administrativo
 */
router.patch('/:id/mute', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const muteSchema = z.object({
      isMuted: z.boolean().optional(),
    });
    const body = muteSchema.parse(req.body || {});

    const [target] = await db.select().from(devices).where(eq(devices.id, id));
    if (!target) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo no encontrado.',
      });
    }

    const newMutedState = body.isMuted !== undefined ? body.isMuted : !target.isMuted;

    const [updated] = await db
      .update(devices)
      .set({
        isMuted: newMutedState,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id))
      .returning();

    await createAuditLog({
      action: newMutedState ? 'device_muted' : 'device_unmuted',
      category: 'devices',
      severity: 'info',
      userId: req.user.id,
      description: `El administrador "${req.user.name}" ${newMutedState ? 'silenció/pausó' : 'reanudó'} la comunicación del nodo "${target.name}".`,
      metadata: { deviceId: id, isMuted: newMutedState },
    });

    getIO()?.emit('device:mute_toggled', {
      deviceId: updated.id,
      isMuted: updated.isMuted,
      name: updated.name,
    });

    return res.json({
      success: true,
      message: updated.isMuted
        ? `El nodo "${target.name}" ha sido silenciado. Sus alertas no dispararán sirenas generales ni banners.`
        : `Comunicación de emergencias reanudada para el nodo "${target.name}".`,
      isMuted: updated.isMuted,
      device: updated,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

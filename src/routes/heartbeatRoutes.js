import express from 'express';
import { z } from 'zod';
import { authenticateDevice } from '../middlewares/deviceAuth.js';
import { recordHeartbeat } from '../services/heartbeatMonitor.js';
import { popDeviceCommands } from '../services/commandService.js';

const router = express.Router();

const heartbeatSchema = z.object({
  batteryLevel: z.coerce.number().min(0).max(100),
  isCharging: z.coerce.boolean().default(false),
  batteryTemp: z.coerce.number().optional().default(25.0),
  cpuTemp: z.coerce.number().optional().default(30.0),
  wifiSsid: z.string().optional().nullable(),
  signalStrength: z.coerce.number().optional().nullable(),
  storageFreeMb: z.coerce.number().optional().nullable(),
  memoryFreeMb: z.coerce.number().optional().nullable(),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
  altitude: z.coerce.number().optional().nullable(),
});

/**
 * POST /api/heartbeat
 * Recibe el pulso vital (heartbeat) de un dispositivo Android
 */
router.post('/', authenticateDevice, async (req, res, next) => {
  try {
    const data = heartbeatSchema.parse(req.body);
    const heartbeatRecord = await recordHeartbeat(req.device, data);
    const pendingCommands = popDeviceCommands(req.device.id);

    return res.json({
      success: true,
      message: 'Heartbeat registrado correctamente.',
      device: {
        id: req.device.id,
        name: req.device.name,
        status: req.device.status,
      },
      config: {
        photoIntervalMinutes: req.device.photoIntervalMinutes ?? 3,
        movementThreshold: req.device.movementThreshold ?? 14.5,
        isMuted: req.device.isMuted ?? false,
      },
      commands: pendingCommands,
      heartbeat: {
        id: heartbeatRecord.id,
        batteryLevel: heartbeatRecord.batteryLevel,
        isCharging: heartbeatRecord.isCharging,
        batteryTemp: heartbeatRecord.batteryTemp,
        cpuTemp: heartbeatRecord.cpuTemp,
        receivedAt: heartbeatRecord.receivedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

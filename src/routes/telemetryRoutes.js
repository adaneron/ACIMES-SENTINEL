import express from 'express';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { deviceTelemetries } from '../db/schema.js';
import { authenticateDevice } from '../middlewares/deviceAuth.js';
import { processTelemetry } from '../services/telemetryService.js';

const router = express.Router();

const telemetrySchema = z
  .object({
    accelX: z.coerce.number().optional(),
    accelY: z.coerce.number().optional(),
    accelZ: z.coerce.number().optional(),
    ax: z.coerce.number().optional(),
    ay: z.coerce.number().optional(),
    az: z.coerce.number().optional(),
    magnitude: z.coerce.number().optional(),
    accelMagnitude: z.coerce.number().optional(),
    value: z.coerce.number().optional(),
    type: z.string().optional(),
    source: z.string().optional(),
    unit: z.string().optional(),
    status: z.string().optional(),
    data: z.record(z.any()).optional(),
    latitude: z.coerce.number().optional().nullable(),
    longitude: z.coerce.number().optional().nullable(),
    altitude: z.coerce.number().optional().nullable(),
    accuracy: z.coerce.number().optional().nullable(),
    speed: z.coerce.number().optional().nullable(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    rawData: z.record(z.any()).optional(),
  })
  .passthrough()
  .transform((b) => {
    const d = b.data || {};
    const x = b.accelX ?? b.ax ?? d.accelX ?? d.ax ?? d.x ?? 0;
    const y = b.accelY ?? b.ay ?? d.accelY ?? d.ay ?? d.y ?? 0;
    const z = b.accelZ ?? b.az ?? d.accelZ ?? d.az ?? d.z ?? (b.value || b.magnitude ? 0 : 9.81);
    const explicitMag = b.accelMagnitude ?? b.magnitude ?? b.value ?? d.magnitude ?? d.value;
    const isDangerType =
      b.type === 'earthquake' ||
      b.type === 'sismo' ||
      b.status === 'danger' ||
      Boolean(d.isSeismicAlert);

    return {
      accelX: Number(x),
      accelY: Number(y),
      accelZ: Number(z),
      explicitMagnitude: explicitMag !== undefined ? Number(explicitMag) : null,
      forceSeismicAlert: Boolean(isDangerType),
      latitude: b.latitude,
      longitude: b.longitude,
      altitude: b.altitude,
      accuracy: b.accuracy,
      speed: b.speed,
      timestamp: b.timestamp,
      rawData: b.rawData || b.data || {},
    };
  });


/**
 * POST /api/telemetry
 * Recibe datos de telemetría de acelerómetro y GPS desde la app Android
 * Si el acelerómetro supera el umbral, genera automáticamente una alerta de sismo
 */
router.post('/', authenticateDevice, async (req, res, next) => {
  try {
    const data = telemetrySchema.parse(req.body);
    const result = await processTelemetry(req.device, data);
    console.log('Telemetría procesada:', result);
    return res.status(201).json({
      success: true,
      message: result.incident 
        ? '⚠️ Alerta de sismo detectada y registrada.' 
        : 'Telemetría registrada correctamente.',
      telemetry: {
        id: result.telemetry.id,
        magnitude: result.telemetry.accelMagnitude,
        isSeismicAlert: result.telemetry.isSeismicAlert,
        latitude: result.telemetry.latitude,
        longitude: result.telemetry.longitude,
        capturedAt: result.telemetry.capturedAt,
      },
      incident: result.incident,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/telemetry/recent
 * Obtiene las lecturas de telemetría más recientes (acceso público)
 */
router.get('/recent', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const deviceId = req.query.deviceId;

    let query = db.select().from(deviceTelemetries).orderBy(desc(deviceTelemetries.capturedAt)).limit(limit);

    if (deviceId) {
      query = db
        .select()
        .from(deviceTelemetries)
        .where(eq(deviceTelemetries.deviceId, deviceId))
        .orderBy(desc(deviceTelemetries.capturedAt))
        .limit(limit);
    }

    const records = await query;

    return res.json({
      success: true,
      count: records.length,
      telemetries: records,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

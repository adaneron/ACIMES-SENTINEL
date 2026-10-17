import express from 'express';
import { eq, or, desc } from 'drizzle-orm';
import { db, checkDbConnection } from '../config/database.js';
import { incidents, devices, cameraEvidences } from '../db/schema.js';
import { config } from '../config/env.js';

const router = express.Router();

/**
 * GET /api/health
 * Endpoint de estado para Docker HEALTHCHECK y balanceadores
 */
router.get('/health', async (req, res) => {
  const dbOk = await checkDbConnection();
  return res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'healthy' : 'degraded',
    database: dbOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

/**
 * GET /api/public/summary
 * Resumen para usuarios regulares (sin requerir autenticación)
 */
router.get('/public/summary', async (req, res, next) => {
  try {
    const allDevices = await db.select().from(devices);
    const now = Date.now();
    const timeoutMs = config.heartbeatTimeoutSeconds * 1000;

    const onlineDevices = allDevices.filter((d) => {
      const lastSeen = d.lastHeartbeatAt ? new Date(d.lastHeartbeatAt).getTime() : 0;
      return lastSeen > 0 && now - lastSeen <= timeoutMs;
    });

    const activeIncidents = await db
      .select({
        id: incidents.id,
        title: incidents.title,
        incidentType: incidents.incidentType,
        severity: incidents.severity,
        status: incidents.status,
        latitude: incidents.latitude,
        longitude: incidents.longitude,
        detectedAt: incidents.detectedAt,
        evidencePath: cameraEvidences.filePath,
      })
      .from(incidents)
      .leftJoin(cameraEvidences, eq(incidents.evidenceId, cameraEvidences.id))
      .where(or(eq(incidents.status, 'activa'), eq(incidents.status, 'en_proceso')))
      .orderBy(desc(incidents.detectedAt))
      .limit(10);

    return res.json({
      success: true,
      data: {
        devicesTotal: allDevices.length,
        devicesOnline: onlineDevices.length,
        activeIncidentsCount: activeIncidents.length,
        recentActiveAlerts: activeIncidents,
        systemStatus: activeIncidents.length > 0 ? 'ALERT' : 'NORMAL',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/public/active-alerts
 * Lista de alertas activas para el mapa y banner en tiempo real
 */
router.get('/public/active-alerts', async (req, res, next) => {
  try {
    const activeAlerts = await db
      .select({
        incident: incidents,
        deviceName: devices.name,
        evidencePath: cameraEvidences.filePath,
      })
      .from(incidents)
      .leftJoin(devices, eq(incidents.deviceId, devices.id))
      .leftJoin(cameraEvidences, eq(incidents.evidenceId, cameraEvidences.id))
      .where(or(eq(incidents.status, 'activa'), eq(incidents.status, 'en_proceso')))
      .orderBy(desc(incidents.detectedAt));

    return res.json({
      success: true,
      count: activeAlerts.length,
      alerts: activeAlerts.map(({ incident, deviceName, evidencePath }) => ({
        id: incident.id,
        title: incident.title,
        incidentType: incident.incidentType,
        severity: incident.severity,
        status: incident.status,
        detectedAt: incident.detectedAt,
        latitude: incident.latitude,
        longitude: incident.longitude,
        address: incident.address,
        deviceName: deviceName || 'Sistema',
        evidenceUrl: evidencePath || null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;

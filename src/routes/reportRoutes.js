import express from 'express';
import { z } from 'zod';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { incidents, devices, cameraEvidences, users } from '../db/schema.js';
import { requireAdmin } from '../middlewares/auth.js';
import { emitIncidentAlert, emitIncidentUpdated } from '../services/socketService.js';

const router = express.Router();

const statusUpdateSchema = z.object({
  status: z.enum(['activa', 'en_proceso', 'resuelta', 'falsa_alarma']),
  resolutionNotes: z.string().optional(),
});

const manualReportSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  incidentType: z.enum(['sismo', 'inundacion', 'movimiento_brusco', 'temperatura_extrema', 'bateria_critica', 'manual']),
  severity: z.enum(['baja', 'media', 'alta', 'critica']),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
  address: z.string().optional().nullable(),
  deviceId: z.string().uuid().optional().nullable(),
});

/**
 * GET /api/reports
 * Endpoint principal de informes de incidencias:
 * Retorna ubicación, tipo de incidencia, nivel de severidad, hora y evidencia.
 * Accesible tanto para usuarios regulares (sin login) como administradores.
 */
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    const { type, severity, status, deviceId, from, to } = req.query;

    const conditions = [];

    if (type) conditions.push(eq(incidents.incidentType, type));
    if (severity) conditions.push(eq(incidents.severity, severity));
    if (status) conditions.push(eq(incidents.status, status));
    if (deviceId) conditions.push(eq(incidents.deviceId, deviceId));
    if (from) conditions.push(gte(incidents.detectedAt, new Date(from)));
    if (to) conditions.push(lte(incidents.detectedAt, new Date(to)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Consulta con joins a devices y camera_evidences
    const rows = await db
      .select({
        incident: incidents,
        device: {
          id: devices.id,
          name: devices.name,
          model: devices.model,
          osVersion: devices.osVersion,
        },
        evidence: {
          id: cameraEvidences.id,
          filePath: cameraEvidences.filePath,
          originalFilename: cameraEvidences.originalFilename,
          floodDetected: cameraEvidences.floodDetected,
          floodConfidence: cameraEvidences.floodConfidence,
          waterLevelCm: cameraEvidences.waterLevelCm,
          ocrRawText: cameraEvidences.ocrRawText,
          capturedAt: cameraEvidences.capturedAt,
        },
      })
      .from(incidents)
      .leftJoin(devices, eq(incidents.deviceId, devices.id))
      .leftJoin(cameraEvidences, eq(incidents.evidenceId, cameraEvidences.id))
      .where(whereClause)
      .orderBy(desc(incidents.detectedAt))
      .limit(limit)
      .offset(offset);

    // Contar total para paginación
    const [countResult] = await db
      .select({ count: sql`count(*)` })
      .from(incidents)
      .where(whereClause);

    const total = parseInt(countResult?.count || '0', 10);

    // Mapeo estructurado del informe con todos los requerimientos especificados
    const reports = rows.map(({ incident, device, evidence }) => {
      const detectedDate = new Date(incident.detectedAt);
      return {
        id: incident.id,
        title: incident.title,
        description: incident.description,
        incidentType: incident.incidentType,
        severity: incident.severity,
        status: incident.status,
        hora: detectedDate.toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour12: true }),
        fecha: detectedDate.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }),
        detectedAt: incident.detectedAt ? new Date(incident.detectedAt).toISOString() : null,
        createdAt: incident.createdAt ? new Date(incident.createdAt).toISOString() : null,
        location: {
          latitude: incident.latitude,
          longitude: incident.longitude,
          address: incident.address || (incident.latitude && incident.longitude ? `Coord: ${incident.latitude.toFixed(4)}, ${incident.longitude.toFixed(4)}` : 'Ubicación no especificada'),
        },
        evidence: evidence?.id ? {
          id: evidence.id,
          url: evidence.filePath,
          filename: evidence.originalFilename,
          floodDetected: evidence.floodDetected,
          floodConfidence: evidence.floodConfidence,
          waterLevelCm: evidence.waterLevelCm,
          ocrText: evidence.ocrRawText,
          capturedAt: evidence.capturedAt,
        } : null,
        device: device?.id ? device : null,
        sensorSnapshot: incident.sensorSnapshot,
        resolvedAt: incident.resolvedAt,
      };
    });

    return res.json({
      success: true,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      reports,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/stats
 * Resumen estadístico de incidencias para dashboards y métricas rápidas
 */
router.get('/stats', async (req, res, next) => {
  try {
    const allIncidents = await db.select().from(incidents);

    const stats = {
      total: allIncidents.length,
      active: allIncidents.filter((i) => i.status === 'activa').length,
      inProgress: allIncidents.filter((i) => i.status === 'en_proceso').length,
      resolved: allIncidents.filter((i) => i.status === 'resuelta').length,
      falseAlarm: allIncidents.filter((i) => i.status === 'falsa_alarma').length,
      byType: {
        sismo: allIncidents.filter((i) => i.incidentType === 'sismo').length,
        inundacion: allIncidents.filter((i) => i.incidentType === 'inundacion').length,
        movimiento_brusco: allIncidents.filter((i) => i.incidentType === 'movimiento_brusco').length,
        bateria_critica: allIncidents.filter((i) => i.incidentType === 'bateria_critica').length,
        temperatura_extrema: allIncidents.filter((i) => i.incidentType === 'temperatura_extrema').length,
        manual: allIncidents.filter((i) => i.incidentType === 'manual').length,
      },
      bySeverity: {
        critica: allIncidents.filter((i) => i.severity === 'critica').length,
        alta: allIncidents.filter((i) => i.severity === 'alta').length,
        media: allIncidents.filter((i) => i.severity === 'media').length,
        baja: allIncidents.filter((i) => i.severity === 'baja').length,
      },
    };

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/export/csv
 * Exporta el historial de informes de incidencias a formato CSV (Solo Administradores)
 */
router.get('/export/csv', requireAdmin, async (req, res, next) => {
  try {
    const rows = await db
      .select({
        incident: incidents,
        deviceName: devices.name,
        evidencePath: cameraEvidences.filePath,
      })
      .from(incidents)
      .leftJoin(devices, eq(incidents.deviceId, devices.id))
      .leftJoin(cameraEvidences, eq(incidents.evidenceId, cameraEvidences.id))
      .orderBy(desc(incidents.detectedAt));

    const csvHeaders = 'ID,Titulo,Tipo,Severidad,Estado,Fecha_Hora,Latitud,Longitud,Direccion,Dispositivo,Evidencia_URL,Descripcion\n';
    const csvRows = rows.map(({ incident, deviceName, evidencePath }) => {
      const cleanDesc = (incident.description || '').replace(/"/g, '""').replace(/\n/g, ' ');
      const cleanTitle = (incident.title || '').replace(/"/g, '""');
      return [
        `"${incident.id}"`,
        `"${cleanTitle}"`,
        `"${incident.incidentType}"`,
        `"${incident.severity}"`,
        `"${incident.status}"`,
        `"${new Date(incident.detectedAt).toISOString()}"`,
        incident.latitude ?? '',
        incident.longitude ?? '',
        `"${incident.address || ''}"`,
        `"${deviceName || 'Manual/N/A'}"`,
        `"${evidencePath || 'Sin evidencia'}"`,
        `"${cleanDesc}"`,
      ].join(',');
    });

    const csvContent = csvHeaders + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="informes_incidencias_${Date.now()}.csv"`);
    return res.send(csvContent);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/:id
 * Obtiene el detalle completo de un informe de incidencia
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [row] = await db
      .select({
        incident: incidents,
        device: devices,
        evidence: cameraEvidences,
        resolvedBy: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(incidents)
      .leftJoin(devices, eq(incidents.deviceId, devices.id))
      .leftJoin(cameraEvidences, eq(incidents.evidenceId, cameraEvidences.id))
      .leftJoin(users, eq(incidents.resolvedById, users.id))
      .where(eq(incidents.id, id));

    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'Informe de incidencia no encontrado.',
      });
    }

    const detectedDate = new Date(row.incident.detectedAt);

    return res.json({
      success: true,
      report: {
        id: row.incident.id,
        title: row.incident.title,
        description: row.incident.description,
        incidentType: row.incident.incidentType,
        severity: row.incident.severity,
        status: row.incident.status,
        hora: detectedDate.toLocaleTimeString('es-VE', { hour12: false }),
        fecha: detectedDate.toLocaleDateString('es-VE'),
        detectedAt: row.incident.detectedAt,
        location: {
          latitude: row.incident.latitude,
          longitude: row.incident.longitude,
          address: row.incident.address,
        },
        evidence: row.evidence ? {
          id: row.evidence.id,
          url: row.evidence.filePath,
          filename: row.evidence.originalFilename,
          floodDetected: row.evidence.floodDetected,
          floodConfidence: row.evidence.floodConfidence,
          waterLevelCm: row.evidence.waterLevelCm,
          ocrRawText: row.evidence.ocrRawText,
          capturedAt: row.evidence.capturedAt,
        } : (row.device?.id ? await (async () => {
          const [devEv] = await db
            .select()
            .from(cameraEvidences)
            .where(eq(cameraEvidences.deviceId, row.device.id))
            .orderBy(desc(cameraEvidences.capturedAt))
            .limit(1);
          return devEv ? {
            id: devEv.id,
            url: devEv.filePath,
            filename: devEv.originalFilename,
            floodDetected: devEv.floodDetected,
            floodConfidence: devEv.floodConfidence,
            waterLevelCm: devEv.waterLevelCm,
            ocrRawText: devEv.ocrRawText,
            capturedAt: devEv.capturedAt,
            isDeviceSnapshot: true,
          } : null;
        })() : null),
        device: row.device ? {
          id: row.device.id,
          name: row.device.name,
          model: row.device.model,
          status: row.device.status,
        } : null,
        sensorSnapshot: row.incident.sensorSnapshot,
        resolvedAt: row.incident.resolvedAt,
        resolvedBy: row.resolvedBy,
        createdAt: row.incident.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/reports
 * Creación manual de un informe de incidencia (Solo Administradores)
 */
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const data = manualReportSchema.parse(req.body);

    const [created] = await db
      .insert(incidents)
      .values({
        title: data.title,
        description: data.description || 'Reporte ingresado manualmente por operador.',
        incidentType: data.incidentType,
        severity: data.severity,
        status: 'activa',
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        deviceId: data.deviceId,
        detectedAt: new Date(),
      })
      .returning();

    emitIncidentAlert(created);

    return res.status(201).json({
      success: true,
      message: 'Informe de incidencia creado exitosamente.',
      report: created,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/reports/:id/status
 * Actualiza el estado de una incidencia (ej: marcar como resuelta) (Solo Administradores)
 */
router.patch('/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, resolutionNotes } = statusUpdateSchema.parse(req.body);

    const [existing] = await db.select().from(incidents).where(eq(incidents.id, id));
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Incidencia no encontrada.',
      });
    }

    const updateFields = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'resuelta' || status === 'falsa_alarma') {
      updateFields.resolvedAt = new Date();
      updateFields.resolvedById = req.user.id;
    } else {
      updateFields.resolvedAt = null;
      updateFields.resolvedById = null;
    }

    if (resolutionNotes) {
      const currentDesc = existing.description || '';
      const prefix = (status === 'activa' || status === 'en_proceso')
        ? `[Apelación / Reapertura por ${req.user.name}]:`
        : `[Resolución por ${req.user.name}]:`;
      updateFields.description = `${currentDesc}\n${prefix} ${resolutionNotes}`;
    }

    const [updated] = await db
      .update(incidents)
      .set(updateFields)
      .where(eq(incidents.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Incidencia no encontrada.',
      });
    }

    emitIncidentUpdated(updated);

    return res.json({
      success: true,
      message: `Incidencia actualizada a estado "${status}".`,
      report: updated,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

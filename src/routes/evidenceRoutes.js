import express from 'express';
import path from 'path';
import fs from 'fs';
import { eq, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { cameraEvidences, devices } from '../db/schema.js';
import { authenticateDevice } from '../middlewares/deviceAuth.js';
import { uploadEvidenceMiddleware } from '../middlewares/upload.js';
import { processCameraEvidence } from '../services/floodOcrService.js';

const router = express.Router();

/**
 * POST /api/evidence/upload
 * Endpoint donde los dispositivos Android suben fotos periódicas de su cámara externa
 * Ejecuta la verificación OCR / detección de inundación y genera alertas si procede
 */
router.post(
  '/upload',
  authenticateDevice,
  uploadEvidenceMiddleware,
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No se recibió ningún archivo de imagen en la solicitud.',
        });
      }

      const result = await processCameraEvidence(req.device, req.file, req.body);
 console.log
      return res.status(201).json({
        success: true,
        message: result.evidence.floodDetected
          ? '🌊 Foto analizada: Inundación detectada. Alerta generada.'
          : 'Foto de evidencia recibida y verificada correctamente.',
        evidence: {
          id: result.evidence.id,
          filePath: result.evidence.filePath,
          originalFilename: result.evidence.originalFilename,
          fileSize: result.evidence.fileSize,
          latitude: result.evidence.latitude,
          longitude: result.evidence.longitude,
          ocrStatus: result.evidence.ocrStatus,
          ocrRawText: result.evidence.ocrRawText,
          floodDetected: result.evidence.floodDetected,
          floodConfidence: result.evidence.floodConfidence,
          waterLevelCm: result.evidence.waterLevelCm,
          capturedAt: result.evidence.capturedAt,
        },
        incident: result.incident,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/evidence
 * Lista las evidencias fotográficas capturadas (acceso público)
 */
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
    const deviceId = req.query.deviceId;

    let query = db
      .select({
        id: cameraEvidences.id,
        deviceId: cameraEvidences.deviceId,
        filePath: cameraEvidences.filePath,
        originalFilename: cameraEvidences.originalFilename,
        fileSize: cameraEvidences.fileSize,
        latitude: cameraEvidences.latitude,
        longitude: cameraEvidences.longitude,
        capturedAt: cameraEvidences.capturedAt,
        ocrStatus: cameraEvidences.ocrStatus,
        ocrRawText: cameraEvidences.ocrRawText,
        floodDetected: cameraEvidences.floodDetected,
        floodConfidence: cameraEvidences.floodConfidence,
        waterLevelCm: cameraEvidences.waterLevelCm,
        deviceName: devices.name,
      })
      .from(cameraEvidences)
      .leftJoin(devices, eq(cameraEvidences.deviceId, devices.id))
      .orderBy(desc(cameraEvidences.capturedAt))
      .limit(limit);

    const records = await query;

    return res.json({
      success: true,
      count: records.length,
      evidences: records,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/evidence/:id
 * Obtiene el detalle o archivo de una evidencia fotográfica por ID o nombre de archivo
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Si el parámetro id es directamente un archivo de imagen (ej. evidence_123.jpg)
    if (/\.(jpg|jpeg|png|webp)$/i.test(id)) {
      const directFilePath = path.resolve(process.cwd(), 'uploads', 'evidences', id);
      if (fs.existsSync(directFilePath)) {
        return res.sendFile(directFilePath);
      }
    }

    const [evidence] = await db
      .select()
      .from(cameraEvidences)
      .where(eq(cameraEvidences.id, id));

    if (!evidence) {
      return res.status(404).json({
        success: false,
        error: 'Evidencia fotográfica no encontrada.',
      });
    }

    // Si el cliente pide la imagen directamente vía Accept header o query ?raw=true
    if (req.query.raw === 'true' || req.headers.accept?.includes('image/')) {
      const cleanPath = evidence.filePath.replace(/^\//, '');
      const absPath = path.resolve(process.cwd(), cleanPath);
      if (fs.existsSync(absPath)) {
        return res.sendFile(absPath);
      }
    }

    return res.json({
      success: true,
      evidence,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/evidence/:id/photo
 * Sirve directamente el archivo físico de imagen de la evidencia
 */
router.get('/:id/photo', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [evidence] = await db
      .select()
      .from(cameraEvidences)
      .where(eq(cameraEvidences.id, id));

    if (!evidence || !evidence.filePath) {
      return res.status(404).send('Evidencia no encontrada.');
    }

    const cleanPath = evidence.filePath.replace(/^\//, '');
    const absPath = path.resolve(process.cwd(), cleanPath);
    if (fs.existsSync(absPath)) {
      return res.sendFile(absPath);
    }

    return res.status(404).send('Archivo físico de imagen no encontrado.');
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/evidence/:id/download
 * Descarga el archivo de imagen de la evidencia con Content-Disposition
 */
router.get('/:id/download', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [evidence] = await db
      .select()
      .from(cameraEvidences)
      .where(eq(cameraEvidences.id, id));

    if (!evidence || !evidence.filePath) {
      return res.status(404).send('Evidencia no encontrada.');
    }

    const cleanPath = evidence.filePath.replace(/^\//, '');
    const absPath = path.resolve(process.cwd(), cleanPath);
    if (fs.existsSync(absPath)) {
      return res.download(absPath, evidence.originalFilename || 'evidencia_sentinel.jpg');
    }

    return res.status(404).send('Archivo físico de imagen no encontrado.');
  } catch (error) {
    next(error);
  }
});

export default router;

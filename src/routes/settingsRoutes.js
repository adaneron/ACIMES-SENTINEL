import express from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middlewares/auth.js';
import {
  getSeismicConsensusSettings,
  updateSeismicConsensusSettings,
} from '../services/systemSettingsService.js';
import { db } from '../config/database.js';
import { auditLogs } from '../db/schema.js';

const router = express.Router();

const consensusSchema = z.object({
  minDevices: z.number().int().min(1).max(10),
  windowSeconds: z.number().int().min(5).max(60).optional().default(15),
});

/**
 * GET /api/settings/seismic-consensus
 * Obtiene la configuración actual de consenso sísmico multi-nodo
 */
router.get('/seismic-consensus', async (req, res, next) => {
  try {
    const settings = await getSeismicConsensusSettings();
    return res.json({
      success: true,
      settings,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/settings/seismic-consensus
 * Actualiza la cantidad de nodos requeridos para consenso sísmico (Solo Administradores)
 */
router.put('/seismic-consensus', requireAdmin, async (req, res, next) => {
  try {
    const data = consensusSchema.parse(req.body);
    const updated = await updateSeismicConsensusSettings(data.minDevices, data.windowSeconds);

    // Auditoría
    await db.insert(auditLogs).values({
      action: 'seismic_consensus_updated',
      category: 'system',
      userId: req.user?.id || null,
      severity: 'info',
      description: `Operador "${req.user?.name || 'Admin'}" actualizó el consenso sísmico multi-nodo a ${updated.minDevices} dispositivo(s) simultáneos (Ventana: ${updated.windowSeconds}s).`,
      metadata: { settings: updated },
    }).catch(() => {});

    return res.json({
      success: true,
      settings: updated,
      message: `Consenso sísmico configurado: Se requerirán ${updated.minDevices} dispositivo(s) simultáneos para disparar la alerta general y Telegram.`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

import express from 'express';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { emergencyContacts, auditLogs } from '../db/schema.js';
import { requireAdmin } from '../middlewares/auth.js';
import { sendTelegramMessage, getRecentTelegramChats } from '../services/telegramService.js';

const router = express.Router();

const contactSchema = z.object({
  name: z.string().min(2, 'El nombre es obligatorio'),
  organization: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  telegramChatId: z.string().optional().nullable(),
  notifyTelegram: z.boolean().default(true),
  notifySms: z.boolean().default(false),
  alertOnEarthquake: z.boolean().default(true),
  alertOnFlood: z.boolean().default(true),
  includeCoords: z.boolean().default(true),
  includePhoto: z.boolean().default(true),
  includeTimestamp: z.boolean().default(true),
  includeSeverity: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

/**
 * GET /api/emergency-contacts
 * Lista todos los contactos de emergencia registrados (Protegido para administradores)
 */
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const list = await db
      .select()
      .from(emergencyContacts)
      .orderBy(desc(emergencyContacts.createdAt));

    return res.json({
      success: true,
      contacts: list,
      botUsername: 'sentinelacimesbot',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/emergency-contacts/telegram-chats
 * Lista los usuarios o grupos que han iniciado el bot de Telegram (/start)
 */
router.get('/telegram-chats', requireAdmin, async (req, res, next) => {
  try {
    const chats = await getRecentTelegramChats();
    return res.json({
      success: true,
      chats,
      botUsername: 'sentinelacimesbot',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/emergency-contacts/for-device
 * Retorna lista de contactos de emergencia para que la app móvil pueda sincronizar teléfonos
 */
router.get('/for-device', async (req, res, next) => {
  try {
    const list = await db
      .select({
        id: emergencyContacts.id,
        name: emergencyContacts.name,
        organization: emergencyContacts.organization,
        phone: emergencyContacts.phone,
        alertOnEarthquake: emergencyContacts.alertOnEarthquake,
        alertOnFlood: emergencyContacts.alertOnFlood,
        isActive: emergencyContacts.isActive,
      })
      .from(emergencyContacts)
      .where(eq(emergencyContacts.isActive, true));

    return res.json({
      success: true,
      contacts: list,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/emergency-contacts
 * Registra un nuevo contacto de autoridad / canal de emergencia
 */
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const data = contactSchema.parse(req.body);

    const [newContact] = await db
      .insert(emergencyContacts)
      .values(data)
      .returning();

    // Log de auditoría
    await db.insert(auditLogs).values({
      action: 'emergency_contact_created',
      category: 'system',
      userId: req.user.id,
      severity: 'info',
      description: `Operador "${req.user.name}" registró nuevo canal de emergencia: "${newContact.name}" (${newContact.organization || 'General'}).`,
      metadata: { contactId: newContact.id, data },
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      contact: newContact,
      message: 'Contacto de emergencia registrado exitosamente.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/emergency-contacts/:id
 * Actualiza la configuración y preferencias de despacho de un contacto
 */
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = contactSchema.partial().parse(req.body);

    const [updated] = await db
      .update(emergencyContacts)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(emergencyContacts.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Contacto no encontrado' });
    }

    return res.json({
      success: true,
      contact: updated,
      message: 'Contacto de emergencia actualizado.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/emergency-contacts/:id
 * Elimina un contacto de emergencia
 */
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [deleted] = await db
      .delete(emergencyContacts)
      .where(eq(emergencyContacts.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Contacto no encontrado' });
    }

    // Log de auditoría
    await db.insert(auditLogs).values({
      action: 'emergency_contact_deleted',
      category: 'system',
      userId: req.user.id,
      severity: 'info',
      description: `Operador "${req.user.name}" eliminó canal de emergencia "${deleted.name}".`,
    }).catch(() => {});

    return res.json({
      success: true,
      message: `Contacto "${deleted.name}" eliminado correctamente.`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/emergency-contacts/:id/test
 * Envía un mensaje de prueba al chat de Telegram del contacto para verificar conexión
 */
router.post('/:id/test', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [contact] = await db
      .select()
      .from(emergencyContacts)
      .where(eq(emergencyContacts.id, id));

    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contacto no encontrado' });
    }

    if (!contact.telegramChatId) {
      return res.status(400).json({ success: false, error: 'El contacto no tiene configurado un ID de chat de Telegram' });
    }

    const testMessage = `🚨 <b>SENTINEL | MENSAJE DE PRUEBA DE CANAL OFICIAL</b>
<b>Autoridad / Destinatario:</b> ${contact.name} (${contact.organization || 'Comando'})
<b>Estado del Bot:</b> Conectado (@sentinelacimesbot)
<b>Hora Local:</b> ${new Date().toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour12: true })} (HLV)
<i>Este es un mensaje de prueba para verificar que el despacho automático de emergencias está 100% operativo.</i>`;

    const result = await sendTelegramMessage(contact.telegramChatId, testMessage, contact.name);

    if (result?.ok) {
      return res.json({
        success: true,
        message: `Mensaje de prueba enviado exitosamente a "${contact.name}" por Telegram.`,
        telegramResponse: result,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: `Error al enviar mensaje por Telegram: ${result?.description || result?.error || 'Verifica el Chat ID'}`,
        tip: 'Asegúrate de haber iniciado el bot en Telegram enviándole /start a @sentinelacimesbot o agregándolo a tu grupo/canal.',
        telegramResponse: result,
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/emergency-contacts/test-custom
 * Prueba un chat ID de Telegram ingresado al momento de crear el contacto
 */
router.post('/test-custom', requireAdmin, async (req, res, next) => {
  try {
    const { telegramChatId, name } = req.body;
    if (!telegramChatId) {
      return res.status(400).json({ success: false, error: 'Se requiere telegramChatId' });
    }

    const testMessage = `🚨 <b>SENTINEL | VERIFICACIÓN DE CANAL TELEGRAM</b>
<b>Destinatario:</b> ${name || 'Contacto de Emergencia'}
<b>Hora Local:</b> ${new Date().toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour12: true })} (HLV)
<i>Verificación exitosa. Este canal recibirá alertas automáticas de SENTINEL según los eventos configurados.</i>`;

    const result = await sendTelegramMessage(telegramChatId, testMessage, name);

    if (result?.ok) {
      return res.json({
        success: true,
        message: '¡Verificación exitosa! Mensaje de prueba entregado en Telegram.',
      });
    } else {
      return res.status(400).json({
        success: false,
        error: `Telegram rechazó el envío: ${result?.description || 'Verifica el Chat ID'}`,
        tip: 'Recuerda que el usuario o grupo debe haber presionado /start en @sentinelacimesbot antes de poder recibir mensajes del bot.',
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;

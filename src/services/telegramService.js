import fs from 'fs';
import path from 'path';
import { eq, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { emergencyContacts, cameraEvidences, auditLogs } from '../db/schema.js';

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

/**
 * Consulta la API getUpdates de Telegram para listar chats recientes que han iniciado el bot (/start)
 */
export async function getRecentTelegramChats() {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.result)) {
      return [];
    }

    const chatsMap = new Map();
    for (const update of data.result) {
      const msg = update.message || update.channel_post || update.my_chat_member;
      if (!msg) continue;
      const chat = msg.chat || msg.from;
      if (!chat?.id) continue;

      const userFrom = msg.from || {};
      const username = chat.username || userFrom.username || '';
      const fullName = `${chat.first_name || userFrom.first_name || ''} ${chat.last_name || userFrom.last_name || ''}`.trim() || chat.title || 'Usuario Telegram';

      chatsMap.set(String(chat.id), {
        id: String(chat.id),
        numericId: chat.id,
        username: username ? `@${username.replace(/^@/, '')}` : '',
        rawUsername: username.replace(/^@/, '').toLowerCase(),
        name: fullName,
        type: chat.type || 'private',
        lastMessageDate: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
      });
    }

    return Array.from(chatsMap.values()).reverse();
  } catch (err) {
    console.error('❌ Error consultando getUpdates de Telegram:', err.message);
    return [];
  }
}

/**
 * Resuelve un identificador de chat a un ID numérico válido para Telegram Bot API
 * Soporta IDs numéricos directos (ej: "1302902413", "-10012345") o alias como "@Adaneitor", "Adaneitor", o nombres
 */
export async function resolveTelegramChatId(chatId, contactName = '') {
  if (!chatId) return null;
  const raw = String(chatId).trim();

  // Si ya es un ID numérico de Telegram válido (entero sin ceros iniciales y no un teléfono que comience por 04 o 58)
  if (/^-?[1-9]\d{5,12}$/.test(raw) && !raw.startsWith('04') && !raw.startsWith('58')) {
    return raw;
  }

  // Si es un username (ej: @Adaneitor), o un número telefónico (ej: 04248058859), o un nombre
  try {
    const cleanTarget = raw.replace(/^@/, '').toLowerCase().trim();
    const cleanName = String(contactName || '').toLowerCase().trim();
    const recent = await getRecentTelegramChats();

    // 1. Coincidencia por username, ID directo o parte del nombre
    const found = recent.find((c) =>
      c.rawUsername === cleanTarget ||
      c.id === raw ||
      (cleanTarget && c.name.toLowerCase().includes(cleanTarget)) ||
      (cleanName && (c.name.toLowerCase().includes(cleanName) || c.rawUsername.includes(cleanName)))
    );

    if (found) {
      console.log(`🔍 Telegram Chat ID resuelto automáticamente: "${raw}" -> ID: ${found.id} (${found.name})`);
      return found.id;
    }

    // 2. Si solo hay 1 chat reciente activo en el bot, redirigir a ese chat para máxima conveniencia
    if (recent.length === 1) {
      console.log(`🔍 Redirigiendo a único chat activo en el bot para "${raw}": ID: ${recent[0].id} (${recent[0].name})`);
      return recent[0].id;
    }
  } catch (e) {
    console.warn(`⚠️ No se pudo auto-resolver alias de Telegram "${raw}":`, e.message);
  }

  return raw;
}

/**
 * Envía un mensaje de texto por Telegram usando la API de Bot de Telegram
 * @param {string|number} chatId ID del chat, canal, grupo o username
 * @param {string} text Contenido del mensaje (formato HTML permitido)
 * @param {string} contactName Nombre opcional de la autoridad para resolver alias
 */
export async function sendTelegramMessage(chatId, text, contactName = '') {
  try {
    const resolvedChatId = await resolveTelegramChatId(chatId, contactName);
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(resolvedChatId).trim(),
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`❌ Error enviando mensaje Telegram a ${chatId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Envía una foto con descripción adjunta por Telegram
 * @param {string|number} chatId ID del chat
 * @param {string} photoPath Ruta absoluta o relativa del archivo en disco
 * @param {string} caption Descripción de la imagen en HTML
 * @param {string} contactName Nombre opcional de la autoridad para resolver alias
 */
export async function sendTelegramPhoto(chatId, photoPath, caption = '', contactName = '') {
  try {
    const resolvedChatId = await resolveTelegramChatId(chatId, contactName);
    let resolvedPath = photoPath;
    if (!path.isAbsolute(photoPath)) {
      resolvedPath = path.resolve(process.cwd(), photoPath.startsWith('/') ? photoPath.slice(1) : photoPath);
    }

    if (!fs.existsSync(resolvedPath)) {
      console.warn(`⚠️ Foto no encontrada en ${resolvedPath}, enviando texto de respaldo...`);
      return sendTelegramMessage(resolvedChatId, caption, contactName);
    }

    const fileBuffer = fs.readFileSync(resolvedPath);
    const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('chat_id', String(resolvedChatId).trim());
    formData.append('photo', blob, path.basename(resolvedPath));
    if (caption) {
      formData.append('caption', caption.slice(0, 1024)); // Límite de caption en Telegram
      formData.append('parse_mode', 'HTML');
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn(`⚠️ Falló sendPhoto (${data.description}), reintentando con mensaje de texto simple...`);
      return sendTelegramMessage(chatId, caption);
    }
    return data;
  } catch (err) {
    console.error(`❌ Error enviando foto Telegram a ${chatId}:`, err.message);
    return sendTelegramMessage(chatId, caption);
  }
}

/**
 * Da formato personalizado a la alerta según las casillas de configuración del contacto
 * @param {object} incident Datos del incidente
 * @param {object} contact Configuración del contacto de emergencia
 * @returns {string} Mensaje HTML estructurado
 */
export function formatIncidentAlert(incident, contact) {
  const isQuake = incident.incidentType === 'sismo';
  const isFlood = incident.incidentType === 'inundacion';
  const icon = isQuake ? '🚨⚡' : isFlood ? '🚨🌊' : '🚨⚠️';

  const parts = [];
  parts.push(`<b>${icon} SENTINEL | ALERTA A AUTORIDADES</b>`);
  parts.push(`<b>Incidencia:</b> ${incident.title || 'Alerta de Emergencia'}`);

  if (contact.includeSeverity) {
    parts.push(`<b>Nivel de Severidad:</b> ${String(incident.severity || 'ALTA').toUpperCase()}`);
    if (incident.description) {
      parts.push(`<b>Detalles:</b> ${incident.description}`);
    }
    if (isQuake && incident.sensorSnapshot?.magnitude) {
      parts.push(`<b>Aceleración Sísmica:</b> ${parseFloat(incident.sensorSnapshot.magnitude).toFixed(2)} m/s² (Umbral: ${incident.sensorSnapshot.threshold || 14.5} m/s²)`);
    }
    if (isFlood && incident.sensorSnapshot?.waterLevelCm) {
      parts.push(`<b>Nivel de Agua Estimado:</b> ${incident.sensorSnapshot.waterLevelCm} cm`);
    }
  }

  if (contact.includeTimestamp) {
    const rawTime = incident.detectedAt || incident.createdAt || new Date();
    const dateObj = new Date(rawTime);
    const timeFormatted = dateObj.toLocaleTimeString('es-VE', {
      timeZone: 'America/Caracas',
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const dateFormatted = dateObj.toLocaleDateString('es-VE', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    parts.push(`<b>Hora y Fecha:</b> ${timeFormatted} - ${dateFormatted} (HLV Venezuela)`);
  }

  const lat = incident.location?.latitude ?? incident.latitude;
  const lng = incident.location?.longitude ?? incident.longitude;
  if (contact.includeCoords && lat != null && lng != null) {
    parts.push(`<b>Coordenadas GPS:</b> ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`);
    parts.push(`<b>Ubicación en Mapa:</b> https://www.google.com/maps?q=${lat},${lng}`);
  }

  const deviceName = incident.device?.name || (incident.deviceId ? `Nodo ID: ${incident.deviceId.slice(0, 8)}` : 'Nodo Terrestre');
  parts.push(`<b>Nodo Centinela:</b> ${deviceName}`);
  parts.push(`<i>Alerta generada y despachada por el Sistema SENTINEL</i>`);

  return parts.join('\n');
}

/**
 * Despacha la alerta a todos los contactos de emergencia activos que tengan habilitado el evento
 * @param {object} incident Incidencia generada
 * @param {string|null} photoFilePath Ruta local a evidencia fotográfica si existe
 */
export async function dispatchIncidentAlertToContacts(incident, photoFilePath = null) {
  try {
    const contacts = await db
      .select()
      .from(emergencyContacts)
      .where(eq(emergencyContacts.isActive, true));

    if (!contacts || contacts.length === 0) {
      return { dispatched: 0, message: 'No hay contactos de emergencia registrados o activos.' };
    }

    const isQuake = incident.incidentType === 'sismo';
    const isFlood = incident.incidentType === 'inundacion';

    // Si no se proporcionó foto explícita, pero el incidente tiene evidencia o es un sismo y el dispositivo tiene una foto reciente
    let resolvedPhotoPath = photoFilePath;
    if (!resolvedPhotoPath && incident.evidence?.filePath) {
      resolvedPhotoPath = path.resolve(process.cwd(), incident.evidence.filePath.startsWith('/') ? incident.evidence.filePath.slice(1) : incident.evidence.filePath);
    }

    if (!resolvedPhotoPath && incident.deviceId) {
      // Buscar última foto registrada por el nodo aunque sea un sismo
      const [latestEvidence] = await db
        .select()
        .from(cameraEvidences)
        .where(eq(cameraEvidences.deviceId, incident.deviceId))
        .orderBy(desc(cameraEvidences.capturedAt))
        .limit(1);

      if (latestEvidence?.filePath) {
        resolvedPhotoPath = path.resolve(process.cwd(), latestEvidence.filePath.startsWith('/') ? latestEvidence.filePath.slice(1) : latestEvidence.filePath);
      }
    }

    const results = [];

    for (const contact of contacts) {
      // Verificar si el contacto está suscrito a este tipo de incidente
      const shouldAlert = (isQuake && contact.alertOnEarthquake) ||
                          (isFlood && contact.alertOnFlood) ||
                          (!isQuake && !isFlood);

      if (!shouldAlert) continue;

      const messageText = formatIncidentAlert(incident, contact);

      // Despacho vía Telegram
      if (contact.notifyTelegram && contact.telegramChatId) {
        let telegramRes = null;
        if (contact.includePhoto && resolvedPhotoPath && fs.existsSync(resolvedPhotoPath)) {
          telegramRes = await sendTelegramPhoto(contact.telegramChatId, resolvedPhotoPath, messageText, contact.name);
        } else {
          telegramRes = await sendTelegramMessage(contact.telegramChatId, messageText, contact.name);
        }

        results.push({
          contactId: contact.id,
          name: contact.name,
          telegramChatId: contact.telegramChatId,
          ok: telegramRes?.ok || false,
        });

        // Registrar en logs de auditoría
        await db.insert(auditLogs).values({
          action: 'telegram_alert_dispatched',
          category: 'system',
          severity: 'info',
          description: `Alerta despachada vía Telegram a autoridad "${contact.name}" (${contact.telegramChatId}) para evento "${incident.title}".`,
          metadata: {
            contactId: contact.id,
            incidentId: incident.id,
            response: telegramRes,
          },
        }).catch(() => {});
      }
    }

    return { dispatched: results.length, details: results };
  } catch (err) {
    console.error('❌ Error en dispatchIncidentAlertToContacts:', err);
    return { dispatched: 0, error: err.message };
  }
}

import { desc, eq, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { auditLogs, devices, users } from '../db/schema.js';
import { getIO } from './socketService.js';

/**
 * Registra un nuevo evento en el registro de auditoría del sistema
 * @param {object} params
 * @param {string} params.action Identificador de acción ('photo_uploaded', 'node_registered', 'node_authorized', etc.)
 * @param {string} [params.category='general'] 'camera' | 'device' | 'auth' | 'incident' | 'system'
 * @param {string} [params.severity='info'] 'info' | 'warning' | 'critical'
 * @param {string} [params.deviceId] ID del dispositivo involucrado (opcional)
 * @param {string} [params.userId] ID del usuario/administrador involucrado (opcional)
 * @param {string} params.description Descripción legible del evento
 * @param {object} [params.metadata] Datos JSON contextuales (rutas, tamaño de archivo, coordenadas, etc.)
 */
export async function createAuditLog({
  action,
  category = 'general',
  severity = 'info',
  deviceId = null,
  userId = null,
  description,
  metadata = null,
}) {
  try {
    const [entry] = await db
      .insert(auditLogs)
      .values({
        action,
        category,
        severity,
        deviceId,
        userId,
        description,
        metadata,
        createdAt: new Date(),
      })
      .returning();

    // Obtener nombres para enriquecer la emisión en tiempo real
    let deviceName = null;
    if (deviceId) {
      const [dev] = await db.select({ name: devices.name }).from(devices).where(eq(devices.id, deviceId));
      deviceName = dev?.name || null;
    }

    let userName = null;
    if (userId) {
      const [usr] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
      userName = usr?.name || null;
    }

    const enrichedEntry = {
      ...entry,
      deviceName,
      userName,
    };

    // Emitir a WebSockets
    const io = getIO();
    if (io) {
      io.emit('audit:new', enrichedEntry);
    }

    return enrichedEntry;
  } catch (err) {
    console.error('❌ Error registrando evento de auditoría:', err.message);
    return null;
  }
}

/**
 * Obtiene el listado de registros de auditoría con paginación y filtros
 */
export async function getAuditLogs({ limit = 50, offset = 0, category = null, severity = null } = {}) {
  const conditions = [];
  if (category) conditions.push(eq(auditLogs.category, category));
  if (severity) conditions.push(eq(auditLogs.severity, severity));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      category: auditLogs.category,
      severity: auditLogs.severity,
      description: auditLogs.description,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      deviceId: auditLogs.deviceId,
      deviceName: devices.name,
      userId: auditLogs.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(devices, eq(auditLogs.deviceId, devices.id))
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}

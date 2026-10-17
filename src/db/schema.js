import { pgTable, uuid, varchar, text, integer, doublePrecision, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Tabla de Usuarios (Administradores y Operadores)
 * Los usuarios regulares del público NO requieren login para visualizar
 * alertas, informes o mapa en vivo.
 */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  role: varchar('role', { length: 50 }).default('admin').notNull(), // 'admin' | 'operador'
  isApproved: boolean('is_approved').default(false).notNull(), // Requiere aprobación del admin principal
  approvedAt: timestamp('approved_at'),
  approvedById: uuid('approved_by_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Tabla de Dispositivos Móviles (Android con la app instalada)
 */
export const devices = pgTable('devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 150 }).notNull(),
  deviceIdentifier: varchar('device_identifier', { length: 100 }).notNull().unique(), // IMEI / Android ID / Unique UUID
  apiKey: varchar('api_key', { length: 255 }).notNull().unique(), // Token de autenticación del dispositivo
  model: varchar('model', { length: 100 }), // ej: "Google Pixel 7", "Samsung Galaxy S22"
  osVersion: varchar('os_version', { length: 50 }), // ej: "Android 14"
  appVersion: varchar('app_version', { length: 50 }), // ej: "1.0.0"
  status: varchar('status', { length: 30 }).default('offline').notNull(), // 'online' | 'offline' | 'warning' | 'critical'
  
  // Último estado conocido de telemetría y heartbeat
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  lastLatitude: doublePrecision('last_latitude'),
  lastLongitude: doublePrecision('last_longitude'),
  lastAltitude: doublePrecision('last_altitude'),
  lastBatteryLevel: integer('last_battery_level'), // 0 - 100 %
  isCharging: boolean('is_charging').default(false),
  lastBatteryTemp: doublePrecision('last_battery_temp'), // °C
  // Calibración de umbral de movimiento/sismo individual por dispositivo (m/s²)
  movementThreshold: doublePrecision('movement_threshold').default(14.5).notNull(),
  // Intervalo de captura periódica de fotos en minutos (por defecto cada 3 minutos)
  photoIntervalMinutes: integer('photo_interval_minutes').default(3).notNull(),

  // Control de autorización de nodo por Administrador
  isAuthorized: boolean('is_authorized').default(true).notNull(), // true para nodos aprobados, false para pendientes
  authRequestedAt: timestamp('auth_requested_at'),
  authorizedAt: timestamp('authorized_at'),
  authorizedById: uuid('authorized_by_id').references(() => users.id, { onDelete: 'set null' }),

  // Control de silencio / pausa de comunicación del nodo (para silenciar alertas en el portal)
  isMuted: boolean('is_muted').default(false).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Tabla de Telemetría de Dispositivos (Acelerómetro + GPS)
 */
export const deviceTelemetries = pgTable('device_telemetries', {
  id: uuid('id').defaultRandom().primaryKey(),
  deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  
  // Mediciones del acelerómetro (m/s² o G)
  accelX: doublePrecision('accel_x'),
  accelY: doublePrecision('accel_y'),
  accelZ: doublePrecision('accel_z'),
  accelMagnitude: doublePrecision('accel_magnitude'), // Vector resultante: sqrt(x² + y² + z²)
  isSeismicAlert: boolean('is_seismic_alert').default(false).notNull(), // Marcador de activación por sismo
  
  // Ubicación GPS exacta
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  altitude: doublePrecision('altitude'),
  accuracy: doublePrecision('accuracy'), // metros
  speed: doublePrecision('speed'), // m/s o km/h
  
  rawData: jsonb('raw_data'), // Datos completos recibidos del sensor en formato JSON
  capturedAt: timestamp('captured_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Tabla de Heartbeats de Dispositivos (Comprobación de conectividad y estado vital)
 */
export const deviceHeartbeats = pgTable('device_heartbeats', {
  id: uuid('id').defaultRandom().primaryKey(),
  deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  
  batteryLevel: integer('battery_level'), // 0 - 100 %
  isCharging: boolean('is_charging').default(false),
  batteryTemp: doublePrecision('battery_temp'), // °C
  cpuTemp: doublePrecision('cpu_temp'), // °C
  
  wifiSsid: varchar('wifi_ssid', { length: 100 }),
  signalStrength: integer('signal_strength'), // dBm o escala 1-5
  storageFreeMb: integer('storage_free_mb'),
  memoryFreeMb: integer('memory_free_mb'),
  
  isOnline: boolean('is_online').default(true).notNull(),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
});

/**
 * Tabla de Evidencia Fotográfica (Fotos periódicas de cámara externa)
 */
export const cameraEvidences = pgTable('camera_evidences', {
  id: uuid('id').defaultRandom().primaryKey(),
  deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  
  filePath: varchar('file_path', { length: 500 }).notNull(),
  originalFilename: varchar('original_filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  capturedAt: timestamp('captured_at').defaultNow().notNull(),
  
  // Procesamiento OCR y Detección de Inundación
  ocrStatus: varchar('ocr_status', { length: 50 }).default('pending').notNull(), // 'pending' | 'processed' | 'failed' | 'skipped'
  ocrRawText: text('ocr_raw_text'),
  floodDetected: boolean('flood_detected').default(false).notNull(),
  floodConfidence: doublePrecision('flood_confidence'), // 0.0 - 1.0
  waterLevelCm: doublePrecision('water_level_cm'), // Nivel estimado de agua en cm si hay regla/marca
  floodMetadata: jsonb('flood_metadata'), // Resultados detallados de la API externa de OCR
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Tabla de Incidencias e Informes
 * Almacena alertas generadas automáticamente (sismo por acelerómetro, inundación por foto/OCR)
 * o registradas por operadores.
 */
export const incidents = pgTable('incidents', {
  id: uuid('id').defaultRandom().primaryKey(),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
  evidenceId: uuid('evidence_id').references(() => cameraEvidences.id, { onDelete: 'set null' }),
  
  // Tipo de incidencia: 'sismo' | 'inundacion' | 'movimiento_brusco' | 'bateria_critica' | 'temperatura_extrema' | 'manual'
  incidentType: varchar('incident_type', { length: 50 }).notNull(),
  
  // Nivel de severidad: 'baja' | 'media' | 'alta' | 'critica'
  severity: varchar('severity', { length: 20 }).notNull(),
  
  // Estado: 'activa' | 'en_proceso' | 'resuelta' | 'falsa_alarma'
  status: varchar('status', { length: 30 }).default('activa').notNull(),
  // Indicador de si el incidente proviene de un nodo silenciado/en pausa
  isMuted: boolean('is_muted').default(false).notNull(),
  
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  address: varchar('address', { length: 255 }),
  
  detectedAt: timestamp('detected_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
  resolvedById: uuid('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),
  
  sensorSnapshot: jsonb('sensor_snapshot'), // Datos del sensor o parámetros que dispararon la incidencia
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Tabla de Registros de Auditoría
 * Registra eventos clave del sistema: subida de fotos, registro y aprobación de nodos,
 * solicitudes de administradores, alertas y resoluciones.
 */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  action: varchar('action', { length: 100 }).notNull(),
  category: varchar('category', { length: 50 }).default('general').notNull(), // 'camera' | 'device' | 'auth' | 'incident' | 'system'
  severity: varchar('severity', { length: 30 }).default('info').notNull(), // 'info' | 'warning' | 'critical'
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  description: text('description').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/* =========================================================================
 * RELACIONES DRIZZLE (drizzle-orm relations)
 * ========================================================================= */

export const usersRelations = relations(users, ({ many }) => ({
  resolvedIncidents: many(incidents),
  auditLogs: many(auditLogs),
}));

export const devicesRelations = relations(devices, ({ many }) => ({
  telemetries: many(deviceTelemetries),
  heartbeats: many(deviceHeartbeats),
  evidences: many(cameraEvidences),
  incidents: many(incidents),
  auditLogs: many(auditLogs),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  device: one(devices, {
    fields: [auditLogs.deviceId],
    references: [devices.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const deviceTelemetriesRelations = relations(deviceTelemetries, ({ one }) => ({
  device: one(devices, {
    fields: [deviceTelemetries.deviceId],
    references: [devices.id],
  }),
}));

export const deviceHeartbeatsRelations = relations(deviceHeartbeats, ({ one }) => ({
  device: one(devices, {
    fields: [deviceHeartbeats.deviceId],
    references: [devices.id],
  }),
}));

export const cameraEvidencesRelations = relations(cameraEvidences, ({ one, many }) => ({
  device: one(devices, {
    fields: [cameraEvidences.deviceId],
    references: [devices.id],
  }),
  incidents: many(incidents),
}));

export const incidentsRelations = relations(incidents, ({ one }) => ({
  device: one(devices, {
    fields: [incidents.deviceId],
    references: [devices.id],
  }),
  evidence: one(cameraEvidences, {
    fields: [incidents.evidenceId],
    references: [cameraEvidences.id],
  }),
  resolvedBy: one(users, {
    fields: [incidents.resolvedById],
    references: [users.id],
  }),
}));

export const emergencyContacts = pgTable('emergency_contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  organization: varchar('organization', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  telegramChatId: varchar('telegram_chat_id', { length: 100 }),
  notifyTelegram: boolean('notify_telegram').default(true).notNull(),
  notifySms: boolean('notify_sms').default(false).notNull(),

  // Casillas de eventos a alertar
  alertOnEarthquake: boolean('alert_on_earthquake').default(true).notNull(),
  alertOnFlood: boolean('alert_on_flood').default(true).notNull(),

  // Casillas de información a incluir en la alerta
  includeCoords: boolean('include_coords').default(true).notNull(),
  includePhoto: boolean('include_photo').default(true).notNull(),
  includeTimestamp: boolean('include_timestamp').default(true).notNull(),
  includeSeverity: boolean('include_severity').default(true).notNull(),

  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Tabla de Configuraciones Globales del Sistema
 * Permite persistir ajustes dinámicos (como el umbral de consenso sísmico multi-nodo)
 */
export const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});


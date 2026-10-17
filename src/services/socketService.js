let ioInstance = null;

/**
 * Inicializa la instancia de Socket.IO con el servidor HTTP
 * @param {import('socket.io').Server} io
 */
export function initSocketService(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    // Unir automáticamente a la sala global de alertas públicas
    socket.join('public_alerts');

    socket.on('subscribe:device', (deviceId) => {
      if (deviceId) {
        socket.join(`device_${deviceId}`);
      }
    });

    socket.on('unsubscribe:device', (deviceId) => {
      if (deviceId) {
        socket.leave(`device_${deviceId}`);
      }
    });

    socket.on('disconnect', () => {
      // Manejar desconexión limpia
    });
  });

  console.log('⚡ Servicio de WebSockets (Socket.IO) inicializado.');
}

/**
 * Emite una nueva incidencia / alerta a todos los clientes conectados en tiempo real
 * @param {object} incident Datos de la incidencia
 */
export function emitIncidentAlert(incident) {
  if (!ioInstance) return;
  ioInstance.emit('incident:new', {
    ...incident,
    emittedAt: new Date().toISOString(),
  });
}

/**
 * Emite una actualización de estado de una incidencia (ej. resuelta)
 * @param {object} incident Datos actualizados de la incidencia
 */
export function emitIncidentUpdated(incident) {
  if (!ioInstance) return;
  ioInstance.emit('incident:updated', {
    ...incident,
    emittedAt: new Date().toISOString(),
  });
}

/**
 * Emite una nueva lectura de telemetría (acelerómetro + GPS)
 * @param {string} deviceId
 * @param {object} telemetry
 */
export function emitTelemetryUpdate(deviceId, telemetry) {
  if (!ioInstance) return;
  // Emitir a la sala global y a la sala particular del dispositivo
  ioInstance.emit('telemetry:update', { deviceId, ...telemetry });
  ioInstance.to(`device_${deviceId}`).emit('device:telemetry', telemetry);
}

/**
 * Emite un nuevo heartbeat de salud recibido de un dispositivo
 * @param {string} deviceId
 * @param {object} heartbeat
 */
export function emitHeartbeatUpdate(deviceId, heartbeat) {
  if (!ioInstance) return;
  ioInstance.emit('heartbeat:update', { deviceId, ...heartbeat });
}

/**
 * Emite un cambio de estado de conectividad de un dispositivo (online -> offline)
 * @param {string} deviceId
 * @param {string} status 'online' | 'offline' | 'warning'
 * @param {object} extraInfo
 */
export function emitDeviceStatusChange(deviceId, status, extraInfo = {}) {
  if (!ioInstance) return;
  ioInstance.emit('device:status_change', {
    deviceId,
    status,
    ...extraInfo,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emite una nueva evidencia fotográfica capturada por un dispositivo
 * @param {string} deviceId
 * @param {object} evidence
 */
export function emitEvidenceCreated(deviceId, evidence) {
  if (!ioInstance) return;
  ioInstance.emit('device:evidence_new', {
    deviceId,
    evidence,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emite actualización de una evidencia fotográfica existente (ej: resultado OCR completado)
 * @param {string} deviceId
 * @param {object} evidence
 */
export function emitEvidenceUpdated(deviceId, evidence) {
  if (!ioInstance) return;
  ioInstance.emit('device:evidence_updated', {
    deviceId,
    evidence,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Retorna la instancia de Socket.IO activa
 */
export function getIO() {
  return ioInstance;
}


import { getIO } from './socketService.js';

// Mapa de comandos remotos pendientes indexados por ID de dispositivo
const pendingCommandsByDevice = new Map();

/**
 * Encola un comando remoto para un dispositivo
 * @param {string} deviceId ID único del dispositivo
 * @param {string} command Comando a ejecutar (ej: 'capture_photo')
 */
export function queueDeviceCommand(deviceId, command) {
  if (!pendingCommandsByDevice.has(deviceId)) {
    pendingCommandsByDevice.set(deviceId, []);
  }
  const commands = pendingCommandsByDevice.get(deviceId);
  if (!commands.includes(command)) {
    commands.push(command);
  }

  // Notificar por WebSocket si el dispositivo o administradores están escuchando
  const io = getIO();
  if (io) {
    io.to(`device_${deviceId}`).emit('device:command', { command, timestamp: new Date().toISOString() });
    io.emit('device:command_queued', { deviceId, command, timestamp: new Date().toISOString() });
  }
}

/**
 * Obtiene y vacía la cola de comandos pendientes para un dispositivo
 * @param {string} deviceId ID único del dispositivo
 * @returns {string[]} Lista de comandos a ejecutar
 */
export function popDeviceCommands(deviceId) {
  if (!pendingCommandsByDevice.has(deviceId)) {
    return [];
  }
  const commands = pendingCommandsByDevice.get(deviceId) || [];
  pendingCommandsByDevice.delete(deviceId);
  return commands;
}

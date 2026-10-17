import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { devices } from '../db/schema.js';

/**
 * Middleware de autenticación para dispositivos móviles.
 * Valida la API Key enviada en la cabecera 'x-api-key', 'x-device-token'
 * o como token Bearer.
 */
export async function authenticateDevice(req, res, next) {
  try {
    const apiKey = 
      req.headers['x-api-key'] || 
      req.headers['api-key'] || 
      req.headers['x-device-token'] || 
      (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
        ? req.headers.authorization.split(' ')[1] 
        : null) ||
      req.query?.apiKey ||
      req.body?.apiKey;

    const deviceIdentifier = 
      req.headers['x-device-identifier'] || 
      req.headers['device-identifier'] || 
      req.headers['x-device-id'] || 
      req.body?.deviceIdentifier || 
      req.body?.identifier ||
      req.query?.deviceIdentifier;

    if (!apiKey && !deviceIdentifier) {
      return res.status(401).json({
        success: false,
        error: 'Se requiere API Key o identificador de dispositivo para enviar telemetría.',
      });
    }

    let device = null;
    if (apiKey) {
      const [devByApiKey] = await db.select().from(devices).where(eq(devices.apiKey, apiKey));
      device = devByApiKey;
    }
    if (!device && deviceIdentifier) {
      const [devByIdentifier] = await db.select().from(devices).where(eq(devices.deviceIdentifier, deviceIdentifier));
      device = devByIdentifier;
    }

    if (!device) {
      return res.status(401).json({
        success: false,
        error: 'Dispositivo no reconocido o API Key inválida.',
      });
    }


    // Verificar si el nodo ha sido autorizado por el Administrador
    if (device.isAuthorized === false) {
      return res.status(403).json({
        success: false,
        error: 'Nodo no autorizado. Pendiente de aprobación por el Administrador en el panel.',
        isAuthorized: false,
        status: device.status,
      });
    }

    req.device = device;
    next();
  } catch (error) {
    next(error);
  }
}

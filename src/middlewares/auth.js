import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { users } from '../db/schema.js';
import { config } from '../config/env.js';

/**
 * Middleware para requerir autenticación de Administrador.
 * Verifica el token JWT en la cabecera 'Authorization: Bearer <token>'.
 */
export async function requireAdmin(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query?.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Acceso no autorizado. Se requiere token de administrador.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch {
      return res.status(401).json({
        success: false,
        error: 'Token inválido o expirado.',
      });
    }

    // Buscar usuario en la base de datos
    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId));
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado. Se requieren privilegios de Administrador.',
      });
    }

    if (user.isApproved === false) {
      return res.status(403).json({
        success: false,
        error: 'Tu cuenta de administrador aún está pendiente de aprobación por el administrador principal.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware opcional para identificar usuarios si envían token,
 * pero permite acceso libre a usuarios regulares/públicos.
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        const [user] = await db.select().from(users).where(eq(users.id, decoded.userId));
        if (user) {
          req.user = user;
        }
      } catch {
        // Token inválido: se ignora para permitir navegación como usuario regular
        req.user = null;
      }
    } else {
      req.user = null;
    }
    next();
  } catch (error) {
    next(error);
  }
}

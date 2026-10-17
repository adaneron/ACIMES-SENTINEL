import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { users } from '../db/schema.js';
import { config } from '../config/env.js';
import { requireAdmin } from '../middlewares/auth.js';

import { desc } from 'drizzle-orm';
import { createAuditLog, getAuditLogs } from '../services/auditService.js';
import { getIO } from '../services/socketService.js';

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email('Formato de correo electrónico inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

const registerAdminSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Formato de correo electrónico inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

/**
 * POST /api/auth/register-admin
 * Registro público para solicitar una cuenta de Administrador (requiere aprobación posterior)
 */
router.post('/register-admin', async (req, res, next) => {
  try {
    const data = registerAdminSchema.parse(req.body);
    const emailNormalized = data.email.toLowerCase().trim();

    const [existing] = await db.select().from(users).where(eq(users.email, emailNormalized));
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'El correo electrónico ya se encuentra registrado en el sistema.',
      });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const [newUser] = await db
      .insert(users)
      .values({
        name: data.name.trim(),
        email: emailNormalized,
        passwordHash,
        role: 'admin',
        isApproved: false,
      })
      .returning();

    // Registrar en auditoría
    await createAuditLog({
      action: 'admin_registration_request',
      category: 'auth',
      severity: 'warning',
      userId: newUser.id,
      description: `Nueva solicitud de cuenta Administrador: "${newUser.name}" (${newUser.email}). Requiere autorización.`,
      metadata: { userId: newUser.id, email: newUser.email, name: newUser.name },
    });

    // Notificar a administradores conectados vía WebSockets
    const io = getIO();
    if (io) {
      io.emit('admin:registration_request', {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        createdAt: newUser.createdAt,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Solicitud de administrador enviada con éxito. Un administrador activo debe autorizar tu cuenta antes de que puedas iniciar sesión.',
      userId: newUser.id,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Inicio de sesión para administradores y operadores
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas. Correo o contraseña incorrectos.',
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas. Correo o contraseña incorrectos.',
      });
    }

    if (user.isApproved === false) {
      return res.status(403).json({
        success: false,
        error: 'Tu cuenta de administrador aún no ha sido autorizada por el administrador principal.',
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    // Registrar acceso en auditoría
    await createAuditLog({
      action: 'admin_login',
      category: 'auth',
      severity: 'info',
      userId: user.id,
      description: `Inicio de sesión exitoso del administrador "${user.name}" (${user.email}).`,
    });

    return res.json({
      success: true,
      message: 'Inicio de sesión exitoso.',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Obtiene el perfil del usuario autenticado
 */
router.get('/me', requireAdmin, async (req, res) => {
  return res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      createdAt: req.user.createdAt,
    },
  });
});

/**
 * GET /api/auth/admin-users
 * Lista todos los administradores (pendientes y aprobados) - Solo Admins
 */
router.get('/admin-users', requireAdmin, async (req, res, next) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isApproved: users.isApproved,
        approvedAt: users.approvedAt,
        approvedById: users.approvedById,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return res.json({
      success: true,
      count: allUsers.length,
      users: allUsers,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/auth/admin-users/:id/approve
 * Aprueba una solicitud de cuenta de Administrador - Solo Admins
 */
router.patch('/admin-users/:id/approve', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [targetUser] = await db.select().from(users).where(eq(users.id, id));

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'Usuario administrador no encontrado.',
      });
    }

    const [updatedUser] = await db
      .update(users)
      .set({
        isApproved: true,
        approvedAt: new Date(),
        approvedById: req.user.id,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    // Registrar en auditoría
    await createAuditLog({
      action: 'admin_approved',
      category: 'auth',
      severity: 'info',
      userId: req.user.id,
      description: `El administrador "${req.user.name}" autorizó la cuenta de administrador de "${targetUser.name}" (${targetUser.email}).`,
      metadata: { targetUserId: targetUser.id, targetEmail: targetUser.email },
    });

    const io = getIO();
    if (io) {
      io.emit('admin:approved', { id: targetUser.id, name: targetUser.name, email: targetUser.email });
    }

    return res.json({
      success: true,
      message: `El administrador "${targetUser.name}" ha sido aprobado exitosamente.`,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        isApproved: updatedUser.isApproved,
        approvedAt: updatedUser.approvedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/auth/admin-users/:id/reject
 * Rechaza y elimina una solicitud de Administrador - Solo Admins
 */
router.patch('/admin-users/:id/reject', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    // No permitir auto-rechazarse o rechazar al admin principal configurado
    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'No puedes rechazar o eliminar tu propia cuenta de administrador.',
      });
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, id));
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'Usuario administrador no encontrado.',
      });
    }

    if (targetUser.email === config.admin.email) {
      return res.status(400).json({
        success: false,
        error: 'No se puede eliminar la cuenta del administrador maestro del sistema.',
      });
    }

    await db.delete(users).where(eq(users.id, id));

    // Registrar en auditoría
    await createAuditLog({
      action: 'admin_rejected',
      category: 'auth',
      severity: 'warning',
      userId: req.user.id,
      description: `El administrador "${req.user.name}" rechazó la solicitud de cuenta de "${targetUser.name}" (${targetUser.email}).`,
    });

    const io = getIO();
    if (io) {
      io.emit('admin:rejected', { id: targetUser.id });
    }

    return res.json({
      success: true,
      message: `La solicitud del usuario "${targetUser.name}" ha sido rechazada.`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/audit-logs
 * Obtiene el registro de auditoría del sistema - Solo Admins
 */
router.get('/audit-logs', requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const category = req.query.category || null;
    const severity = req.query.severity || null;

    const logs = await getAuditLogs({ limit, offset, category, severity });

    return res.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error) {
    next(error);
  }
});

export default router;


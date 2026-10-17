import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, pool } from '../config/database.js';
import { users, devices, deviceHeartbeats, deviceTelemetries, incidents, cameraEvidences } from './schema.js';
import { config } from '../config/env.js';
import { fileURLToPath } from 'url';

/**
 * Puebla la base de datos con un usuario administrador por defecto
 * y dispositivos de prueba con telemetría realista.
 */
export async function seedDatabase() {
  console.log('🌱 Iniciando seed de base de datos...');

  // 1. Crear o actualizar Administrador por defecto
  const existingAdmin = await db.select().from(users).where(eq(users.email, config.admin.email));
  let adminId;

  if (existingAdmin.length === 0) {
    const passwordHash = await bcrypt.hash(config.admin.password, 10);
    const [newAdmin] = await db.insert(users).values({
      email: config.admin.email,
      name: config.admin.name,
      passwordHash,
      role: 'admin',
      isApproved: true,
      approvedAt: new Date(),
    }).returning();
    adminId = newAdmin.id;
    console.log(`👤 Usuario Administrador creado: ${config.admin.email} (Contraseña: ${config.admin.password})`);
  } else {
    adminId = existingAdmin[0].id;
    // Asegurar que el admin principal esté aprobado
    if (!existingAdmin[0].isApproved) {
      await db.update(users).set({ isApproved: true, approvedAt: new Date() }).where(eq(users.id, adminId));
    }
    console.log(`ℹ️ Usuario Administrador ya existía: ${config.admin.email}`);
  }

  // No se crean dispositivos ni incidencias falsas automáticamente.
  // Los nodos se registran físicamente mediante la app Centinela y las alertas
  // son generadas exclusivamente por telemetría real de sensores o cámaras.
  console.log('✅ Seed completado con éxito (modo limpio sin simulaciones automáticas).');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Error en el seed:', err);
      await pool.end();
      process.exit(1);
    });
}

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';

describe('1. Pruebas de Autenticación y Control de Acceso', () => {
  before(async () => {
    await seedDatabase();
  });

  after(async () => {
    if (newAdminId) {
      const { db } = await import('../src/config/database.js');
      const { users, auditLogs } = await import('../src/db/schema.js');
      const { eq } = await import('drizzle-orm');
      await db.delete(auditLogs).where(eq(auditLogs.userId, newAdminId));
      await db.delete(users).where(eq(users.id, newAdminId));
    }
  });

  test('POST /api/auth/login con credenciales válidas debe retornar JWT', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@rally2026.com',
        password: 'admin123456',
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.token, 'Debe incluir un token JWT');
    assert.strictEqual(res.body.user.role, 'admin');
  });

  test('POST /api/auth/login con contraseña incorrecta debe rechazar con 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@rally2026.com',
        password: 'password_erroneo',
      });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  test('GET /api/auth/me sin token debe rechazar con 401', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.strictEqual(res.status, 401);
  });

  test('GET /api/auth/me con token válido de admin debe retornar perfil', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@rally2026.com',
        password: 'admin123456',
      });

    const token = loginRes.body.token;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.email, 'admin@rally2026.com');
    assert.strictEqual(res.body.user.role, 'admin');
  });

  const testNewAdminEmail = `operador-test-${Date.now()}@rally2026.com`;
  let newAdminId = '';
  let adminToken = '';

  test('POST /api/auth/register-admin registra nuevo admin en estado pendiente', async () => {
    const res = await request(app)
      .post('/api/auth/register-admin')
      .send({
        name: 'Operador Test Terreno',
        email: testNewAdminEmail,
        password: 'passwordSegura123',
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.userId);
    newAdminId = res.body.userId;
  });

  test('POST /api/auth/login de admin no aprobado debe rechazar con 403', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testNewAdminEmail,
        password: 'passwordSegura123',
      });

    assert.strictEqual(res.status, 403);
    assert.ok(res.body.error.includes('autorizada'));
  });

  test('GET /api/auth/admin-users con token admin lista los administradores', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@rally2026.com', password: 'admin123456' });
    adminToken = loginRes.body.token;

    const res = await request(app)
      .get('/api/auth/admin-users')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.users));
    const found = res.body.users.find((u) => u.id === newAdminId);
    assert.ok(found);
    assert.strictEqual(found.isApproved, false);
  });

  test('PATCH /api/auth/admin-users/:id/approve aprueba al nuevo administrador', async () => {
    const res = await request(app)
      .patch(`/api/auth/admin-users/${newAdminId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.user.isApproved, true);
  });

  test('POST /api/auth/login del administrador recién aprobado ahora responde 200', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testNewAdminEmail,
        password: 'passwordSegura123',
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.token);
  });

  test('GET /api/auth/audit-logs retorna registro de auditoría con las acciones registradas', async () => {
    const res = await request(app)
      .get('/api/auth/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.logs));
    assert.ok(res.body.logs.length >= 1);
  });
});

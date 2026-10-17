import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/database.js';
import { emergencyContacts } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('7. Pruebas de Contactos de Emergencia & Despacho a Autoridades (Telegram/SMS)', () => {
  let adminToken = '';
  let createdContactId = '';

  before(async () => {
    // Autenticar como administrador
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@rally2026.com', password: 'admin123456' });

    assert.equal(res.status, 200);
    adminToken = res.body.token;
    assert.ok(adminToken, 'Debe obtener token de administrador');
  });

  after(async () => {
    if (createdContactId) {
      await db.delete(emergencyContacts).where(eq(emergencyContacts.id, createdContactId));
    }
  });

  it('GET /api/emergency-contacts sin token debe rechazar con 401', async () => {
    const res = await request(app).get('/api/emergency-contacts');
    assert.equal(res.status, 401);
  });

  it('GET /api/emergency-contacts con token de admin retorna lista de contactos', async () => {
    const res = await request(app)
      .get('/api/emergency-contacts')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.contacts));
    assert.equal(res.body.botUsername, 'sentinelacimesbot');
  });

  it('POST /api/emergency-contacts con datos inválidos debe rechazar con 400', async () => {
    const res = await request(app)
      .post('/api/emergency-contacts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ organization: 'Sin Nombre' });

    assert.equal(res.status, 400);
  });

  it('POST /api/emergency-contacts registra una nueva autoridad con casillas configuradas', async () => {
    const res = await request(app)
      .post('/api/emergency-contacts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Protección Civil Barcelona (Test)',
        organization: 'Comando de Emergencias Anzoátegui',
        phone: '+584120001122',
        telegramChatId: '123456789',
        notifyTelegram: true,
        notifySms: true,
        alertOnEarthquake: true,
        alertOnFlood: true,
        includeCoords: true,
        includePhoto: true,
        includeTimestamp: true,
        includeSeverity: true,
        isActive: true,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.contact.id);
    assert.equal(res.body.contact.name, 'Protección Civil Barcelona (Test)');
    assert.equal(res.body.contact.alertOnEarthquake, true);
    assert.equal(res.body.contact.includePhoto, true);
    createdContactId = res.body.contact.id;
  });

  it('GET /api/emergency-contacts/for-device retorna lista de contactos activos sin requerir login admin', async () => {
    const res = await request(app).get('/api/emergency-contacts/for-device');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.contacts));
    const found = res.body.contacts.find((c) => c.id === createdContactId);
    assert.ok(found, 'El contacto creado debe estar en la lista para dispositivos');
  });

  it('PUT /api/emergency-contacts/:id actualiza preferencias de despacho del contacto', async () => {
    const res = await request(app)
      .put(`/api/emergency-contacts/${createdContactId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        alertOnFlood: false,
        organization: 'Dirección General de Riesgo Actualizada',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.contact.alertOnFlood, false);
    assert.equal(res.body.contact.organization, 'Dirección General de Riesgo Actualizada');
  });

  it('DELETE /api/emergency-contacts/:id elimina el contacto', async () => {
    const res = await request(app)
      .delete(`/api/emergency-contacts/${createdContactId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    createdContactId = '';
  });
});

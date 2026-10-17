import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../src/app.js';

describe('6. Pruebas de Registro de Nodos Centinela y Autorización Admin', () => {
  let adminToken = '';
  const testNodeId = `centinela-node-test-${Date.now()}`;
  let createdDeviceDbId = '';

  test('Obtener token de Administrador', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@rally2026.com', password: 'admin123456' });
    assert.strictEqual(res.status, 200);
    adminToken = res.body.token;
  });

  test('POST /api/devices/register-node registra nodo en estado "pending_authorization"', async () => {
    const res = await request(app)
      .post('/api/devices/register-node')
      .send({
        name: 'Nodo Centinela Prueba',
        deviceIdentifier: testNodeId,
        model: 'Pixel 7',
        osVersion: 'Android 14',
        appVersion: '1.0.0',
        latitude: 10.1367,
        longitude: -64.6860,
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.isAuthorized, false);
    assert.strictEqual(res.body.status, 'pending_authorization');
    assert.ok(res.body.deviceId);
    createdDeviceDbId = res.body.deviceId;
  });

  test('GET /api/devices/node-status/:identifier consulta estado del nodo pendiente', async () => {
    const res = await request(app).get(`/api/devices/node-status/${testNodeId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.isAuthorized, false);
    assert.strictEqual(res.body.status, 'pending_authorization');
    assert.strictEqual(res.body.apiKey, null); // No entrega API Key hasta ser autorizado
  });

  test('Nodo no autorizado intenta enviar telemetría y es rechazado con 403', async () => {
    const res = await request(app)
      .post('/api/telemetry')
      .set('x-device-identifier', testNodeId)
      .send({
        accelX: 0.1,
        accelY: 0.1,
        accelZ: 9.8,
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.isAuthorized, false);
  });

  test('PATCH /api/devices/:id/authorize sin token admin es rechazado con 401', async () => {
    const res = await request(app)
      .patch(`/api/devices/${createdDeviceDbId}/authorize`);
    assert.strictEqual(res.status, 401);
  });

  test('PATCH /api/devices/:id/authorize con token admin autoriza el nodo exitosamente', async () => {
    const res = await request(app)
      .patch(`/api/devices/${createdDeviceDbId}/authorize`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.device.isAuthorized, true);
    assert.strictEqual(res.body.device.status, 'online');
  });

  test('GET /api/devices/node-status/:identifier ahora retorna isAuthorized: true y entrega apiKey', async () => {
    const res = await request(app).get(`/api/devices/node-status/${testNodeId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.isAuthorized, true);
    assert.strictEqual(res.body.status, 'online');
    assert.ok(res.body.apiKey, 'Debe entregar la API key tras autorización');

    // Ahora el nodo sí puede transmitir telemetría con su API key
    const telemRes = await request(app)
      .post('/api/telemetry')
      .set('x-api-key', res.body.apiKey)
      .send({ accelX: 0.2, accelY: 0.2, accelZ: 9.81 });

    assert.strictEqual(telemRes.status, 201);
  });

  test('PATCH /api/devices/:id/threshold sin token admin debe fallar con 401', async () => {
    const res = await request(app)
      .patch(`/api/devices/${createdDeviceDbId}/threshold`)
      .send({ movementThreshold: 8.5 });
    assert.strictEqual(res.status, 401);
  });

  test('PATCH /api/devices/:id/threshold con token admin calibra el umbral sísmico', async () => {
    const res = await request(app)
      .patch(`/api/devices/${createdDeviceDbId}/threshold`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ movementThreshold: 8.5 });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.device.movementThreshold, 8.5);

    // Consultar el estado del nodo y verificar que telemetría use el nuevo umbral (8.5 m/s²)
    const statusRes = await request(app).get(`/api/devices/node-status/${testNodeId}`);
    const telemAlertRes = await request(app)
      .post('/api/telemetry')
      .set('x-api-key', statusRes.body.apiKey)
      .send({ accelX: 5.0, accelY: 5.0, accelZ: 6.0 }); // ~9.27 m/s² > 8.5

    assert.strictEqual(telemAlertRes.status, 201);
    assert.strictEqual(telemAlertRes.body.telemetry.isSeismicAlert, true);
    assert.ok(telemAlertRes.body.incident, 'Debe haber creado un incidente con el umbral calibrado');
  });

  test('POST /api/devices/register-node con nombre ya registrado por otro nodo debe responder 409 Conflict', async () => {
    const res = await request(app)
      .post('/api/devices/register-node')
      .send({
        name: 'Nodo Centinela Prueba', // Mismo nombre que el ya creado
        deviceIdentifier: `centinela-other-${Date.now()}`,
        model: 'Xiaomi Note 10',
      });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('ya está registrado'));
  });

  test('PATCH /api/devices/:id/mute con token admin silencia el nodo', async () => {
    const res = await request(app)
      .patch(`/api/devices/${createdDeviceDbId}/mute`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isMuted: true });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.isMuted, true);
  });

  test('Telemetría sísmica de nodo silenciado genera incidente con isMuted: true', async () => {
    const statusRes = await request(app).get(`/api/devices/node-status/${testNodeId}`);
    const telemRes = await request(app)
      .post('/api/telemetry')
      .set('x-api-key', statusRes.body.apiKey)
      .send({ accelX: 10.0, accelY: 10.0, accelZ: 12.0 });

    assert.strictEqual(telemRes.status, 201);
    assert.ok(telemRes.body.incident);
    assert.strictEqual(telemRes.body.incident.isMuted, true);
  });

  test('PATCH /api/devices/self/mute permite que el propio nodo reanude sus transmisiones', async () => {
    const statusRes = await request(app).get(`/api/devices/node-status/${testNodeId}`);
    const res = await request(app)
      .patch('/api/devices/self/mute')
      .set('x-api-key', statusRes.body.apiKey)
      .send({ isMuted: false });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.isMuted, false);
  });

  after(async () => {
    if (createdDeviceDbId) {
      const { db } = await import('../src/config/database.js');
      const { devices, incidents } = await import('../src/db/schema.js');
      const { eq } = await import('drizzle-orm');
      await db.delete(incidents).where(eq(incidents.deviceId, createdDeviceDbId));
      await db.delete(devices).where(eq(devices.id, createdDeviceDbId));
    }
  });
});

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app.js';
import { db } from '../src/config/database.js';
import { devices } from '../src/db/schema.js';

describe('2. Pruebas de Heartbeats y Estado Vital de Dispositivos', () => {
  const validApiKey = 'dev_token_alfa_scl_2026';
  let testDeviceId = '';

  before(async () => {
    // Asegurar dispositivo temporal para pruebas
    const [dev] = await db
      .insert(devices)
      .values({
        name: 'Dispositivo Barcelona (Test)',
        deviceIdentifier: 'android-bna-001-test',
        apiKey: validApiKey,
        model: 'Google Pixel 7',
        osVersion: 'Android 14',
        status: 'online',
        isAuthorized: true,
      })
      .onConflictDoNothing()
      .returning();

    testDeviceId = dev?.id;
  });

  after(async () => {
    // Limpiar dispositivo temporal del test (cascada a heartbeats)
    if (testDeviceId) {
      await db.delete(devices).where(eq(devices.id, testDeviceId));
    }
  });

  test('POST /api/heartbeat sin credenciales debe fallar con 401', async () => {
    const res = await request(app)
      .post('/api/heartbeat')
      .send({ batteryLevel: 80, isCharging: false });

    assert.strictEqual(res.status, 401);
  });

  test('POST /api/heartbeat con API Key válida registra pulso vital y estado online', async () => {
    const res = await request(app)
      .post('/api/heartbeat')
      .set('x-api-key', validApiKey)
      .send({
        batteryLevel: 92,
        isCharging: true,
        batteryTemp: 28.5,
        cpuTemp: 33.0,
        wifiSsid: 'RedSegura_5G',
        signalStrength: -62,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.heartbeat.batteryLevel, 92);
    assert.strictEqual(res.body.heartbeat.isCharging, true);
    assert.strictEqual(res.body.heartbeat.batteryTemp, 28.5);
    assert.strictEqual(res.body.heartbeat.cpuTemp, 33.0);
  });

  test('GET /api/devices lista dispositivos con cálculo de estado online y métricas', async () => {
    const res = await request(app).get('/api/devices');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.devices));
    assert.ok(res.body.devices.length >= 1);

    const alfaDevice = res.body.devices.find((d) => d.deviceIdentifier === 'android-bna-001-test');
    assert.ok(alfaDevice, 'Debe encontrar el dispositivo alfa');
    assert.strictEqual(alfaDevice.isOnline, true);
    assert.strictEqual(alfaDevice.telemetrySummary.batteryLevel, 92);
    assert.strictEqual(alfaDevice.telemetrySummary.isCharging, true);
  });
});

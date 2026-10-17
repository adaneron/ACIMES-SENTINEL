import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app.js';
import { db } from '../src/config/database.js';
import { devices, incidents } from '../src/db/schema.js';

describe('3. Pruebas de Telemetría (Acelerómetro, Sismo y GPS)', () => {
  const validApiKey = 'dev_token_beta_valpo_2026';
  let testDeviceId = '';

  before(async () => {
    // Asegurar dispositivo temporal para pruebas
    const [dev] = await db
      .insert(devices)
      .values({
        name: 'Dispositivo Barcelona (Test)',
        deviceIdentifier: 'android-bna-002-test',
        apiKey: validApiKey,
        model: 'Samsung Galaxy S22',
        osVersion: 'Android 13',
        status: 'online',
        isAuthorized: true,
      })
      .onConflictDoNothing()
      .returning();

    testDeviceId = dev?.id;
  });

  after(async () => {
    // Limpiar incidencias y dispositivo temporal del test
    if (testDeviceId) {
      await db.delete(incidents).where(eq(incidents.deviceId, testDeviceId));
      await db.delete(devices).where(eq(devices.id, testDeviceId));
    }
  });

  test('POST /api/telemetry con aceleración normal NO debe generar alerta de sismo', async () => {
    const res = await request(app)
      .post('/api/telemetry')
      .set('x-api-key', validApiKey)
      .send({
        accelX: 0.1,
        accelY: 0.2,
        accelZ: 9.81,
        latitude: 10.1367,
        longitude: -64.6860,
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.telemetry.isSeismicAlert, false);
    assert.strictEqual(res.body.incident, null);
  });

  test('POST /api/telemetry con pico de aceleración DEBE disparar alerta de sismo automáticamente', async () => {
    // Magnitud: sqrt(7.5^2 + 9.2^2 + 15.0^2) = sqrt(56.25 + 84.64 + 225) = sqrt(365.89) = 19.12 m/s² > 14.5 m/s²
    const res = await request(app)
      .post('/api/telemetry')
      .set('x-api-key', validApiKey)
      .send({
        accelX: 7.5,
        accelY: 9.2,
        accelZ: 15.0,
        latitude: 10.1367,
        longitude: -64.6860,
        accuracy: 3.5,
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.telemetry.isSeismicAlert, true);
    assert.ok(res.body.incident, 'Debe haber creado un incidente de sismo');
    assert.strictEqual(res.body.incident.incidentType, 'sismo');
    assert.strictEqual(res.body.incident.severity, 'alta');
    assert.strictEqual(res.body.incident.status, 'activa');
    assert.ok(res.body.incident.sensorSnapshot.magnitude > 18.0);
  });

  test('GET /api/telemetry/recent retorna el historial de lecturas', async () => {
    const res = await request(app).get('/api/telemetry/recent?limit=5');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.telemetries));
    assert.ok(res.body.telemetries.length >= 2);
  });
});

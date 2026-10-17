import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app.js';
import { db } from '../src/config/database.js';
import { devices, cameraEvidences, incidents } from '../src/db/schema.js';

describe('4. Pruebas de Cámara Externa, Evidencia Fotográfica y OCR de Inundación', () => {
  const validApiKey = 'dev_token_gamma_ccp_2026';
  let testDeviceId = '';

  before(async () => {
    // Asegurar dispositivo temporal para pruebas
    const [dev] = await db
      .insert(devices)
      .values({
        name: 'Dispositivo Barcelona Evidencia (Test)',
        deviceIdentifier: 'android-bna-003-test',
        apiKey: validApiKey,
        model: 'Motorola Edge 40',
        osVersion: 'Android 14',
        status: 'online',
        isAuthorized: true,
      })
      .onConflictDoNothing()
      .returning();

    testDeviceId = dev?.id;
  });

  after(async () => {
    // Limpiar incidencias, evidencias y dispositivo temporal del test
    if (testDeviceId) {
      await db.delete(incidents).where(eq(incidents.deviceId, testDeviceId));
      await db.delete(cameraEvidences).where(eq(cameraEvidences.deviceId, testDeviceId));
      await db.delete(devices).where(eq(devices.id, testDeviceId));
    }
  });

  // Buffer de imagen JPEG mínima válida
  const fakeJpgBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0xff, 0xd9
  ]);

  test('POST /api/evidence/upload sin archivo debe responder con 400', async () => {
    const res = await request(app)
      .post('/api/evidence/upload')
      .set('x-api-key', validApiKey);

    assert.strictEqual(res.status, 400);
  });

  test('POST /api/evidence/upload con foto y simulación de inundación detecta anegamiento y crea reporte', async () => {
    const res = await request(app)
      .post('/api/evidence/upload')
      .set('x-api-key', validApiKey)
      .field('latitude', '10.1367')
      .field('longitude', '-64.6860')
      .field('simulateFlood', 'true')
      .field('waterLevelCm', '70')
      .attach('photo', fakeJpgBuffer, 'foto_camara_inundacion.jpg');

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.evidence.floodDetected, true);
    assert.strictEqual(res.body.evidence.waterLevelCm, 70);
    assert.ok(res.body.evidence.ocrRawText.includes('NIVEL DE AGUA'));

    // Verifica que se generó la incidencia automática
    assert.ok(res.body.incident, 'Debe haber creado un incidente de inundación');
    assert.strictEqual(res.body.incident.incidentType, 'inundacion');
    assert.strictEqual(res.body.incident.status, 'activa');
  });

  test('GET /api/evidence lista las fotos de evidencia subidas', async () => {
    const res = await request(app).get('/api/evidence');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.evidences));
    assert.ok(res.body.evidences.length >= 1);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../src/app.js';

describe('5. Pruebas de Endpoints de Informes e Incidencias', () => {
  let adminToken = '';

  test('Obtener token de admin para pruebas protegidas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@rally2026.com', password: 'admin123456' });
    assert.strictEqual(res.status, 200);
    adminToken = res.body.token;
  });

  test('GET /api/reports debe ser accesible para usuarios regulares (sin token ni login)', async () => {
    const res = await request(app).get('/api/reports');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.reports));
    assert.ok(res.body.reports.length >= 1, 'Debe haber al menos 1 informe');

    // Verificar que incluya ubicación, tipo, nivel de severidad, hora y evidencia
    const report = res.body.reports[0];
    assert.ok(report.id, 'Debe incluir ID');
    assert.ok(report.incidentType, 'Debe incluir tipo de incidencia');
    assert.ok(report.severity, 'Debe incluir nivel de severidad');
    assert.ok(report.hora, 'Debe incluir hora legible');
    assert.ok(report.location, 'Debe incluir ubicación');
    assert.notStrictEqual(report.location.latitude, undefined);
    assert.notStrictEqual(report.location.longitude, undefined);
  });

  test('GET /api/reports con filtro por tipo "sismo" filtra correctamente', async () => {
    const res = await request(app).get('/api/reports?type=sismo');
    assert.strictEqual(res.status, 200);
    res.body.reports.forEach((rep) => {
      assert.strictEqual(rep.incidentType, 'sismo');
    });
  });

  test('GET /api/reports/stats retorna conteos estadísticos agrupados', async () => {
    const res = await request(app).get('/api/reports/stats');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.stats.total >= 1);
    assert.notStrictEqual(res.body.stats.byType.sismo, undefined);
    assert.notStrictEqual(res.body.stats.byType.inundacion, undefined);
  });

  test('GET /api/reports/export/csv sin token debe rechazar con 401', async () => {
    const res = await request(app).get('/api/reports/export/csv');
    assert.strictEqual(res.status, 401);
  });

  test('GET /api/reports/export/csv con token admin exporta archivo CSV descargable', async () => {
    const res = await request(app)
      .get('/api/reports/export/csv')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.text.includes('ID,Titulo,Tipo,Severidad,Estado'));
  });

  test('PATCH /api/reports/:id/status sin token de admin debe rechazar con 401', async () => {
    const reportsRes = await request(app).get('/api/reports');
    const firstReport = reportsRes.body.reports[0];

    const res = await request(app)
      .patch(`/api/reports/${firstReport.id}/status`)
      .send({ status: 'resuelta' });

    assert.strictEqual(res.status, 401);
  });

  test('PATCH /api/reports/:id/status con token de admin actualiza y resuelve incidencia', async () => {
    const reportsRes = await request(app).get('/api/reports?status=activa');
    if (reportsRes.body.reports.length === 0) return;

    const reportToResolve = reportsRes.body.reports[0];

    const res = await request(app)
      .patch(`/api/reports/${reportToResolve.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'resuelta',
        resolutionNotes: 'Inspeccionado por equipo de respuesta rápida en terreno. Situación normalizada.',
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.report.status, 'resuelta');
    assert.ok(res.body.report.resolvedAt);
  });
});

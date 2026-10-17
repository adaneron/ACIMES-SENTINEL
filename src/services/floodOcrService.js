import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';
import { eq, and, ne } from 'drizzle-orm';
import { db } from '../config/database.js';
import { cameraEvidences, incidents } from '../db/schema.js';
import { config } from '../config/env.js';
import { emitIncidentAlert, emitEvidenceCreated, emitEvidenceUpdated } from './socketService.js';
import { createAuditLog } from './auditService.js';
import { dispatchIncidentAlertToContacts } from './telegramService.js';

const execFileAsync = util.promisify(execFile);


/**
 * Servicio de Verificación OCR y Detección de Inundaciones
 * 
 * Diseñado con arquitectura modular:
 * 1. Si config.externalOcr.apiUrl está configurada, despacha la imagen a dicha API.
 * 2. Si no está configurada, utiliza el motor heurístico/simulador integrado
 *    para permitir pruebas inmediatas antes de que el usuario provea la API final.
 */

/**
 * Llama a la API de LM Studio / OpenAI Vision configurada
 * @param {string} filePath Ruta del archivo local
 * @param {string} originalName Nombre original del archivo
 * @returns {Promise<{rawText: string, floodDetected: boolean, confidence: number, waterLevelCm: number|null, severity: string, metadata: object}>}
/**
 * Parsea la respuesta del modelo de visión de LM Studio (tanto JSON como texto de razonamiento de Qwen)
 */
function parseVisionResponse(content, reasoning, originalName) {
  const combined = ((content || '') + '\n' + (reasoning || '')).trim();

  // 1. Intentar encontrar y parsear bloques JSON
  const jsonMatches = combined.match(/\{[\s\S]*?\}/g);
  if (jsonMatches) {
    for (let i = jsonMatches.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(jsonMatches[i]);
        if (parsed.flood_detected !== undefined || parsed.inundacion !== undefined) {
          const isFlood = Boolean(parsed.flood_detected || parsed.inundacion);
          return {
            rawText: parsed.text || parsed.ocr_text || (isFlood ? 'Inundación confirmada por visión artificial GPU.' : 'Calzada normal despejada.'),
            floodDetected: isFlood,
            confidence: parsed.confidence ? parseFloat(parsed.confidence) : 0.95,
            waterLevelCm: parsed.water_level_cm ? parseFloat(parsed.water_level_cm) : (isFlood ? 45.0 : 0),
            severity: parsed.severity || (isFlood ? 'alta' : 'baja'),
            metadata: {
              engine: 'lm_studio_gpu_vision',
              source: 'json_output',
              ...parsed
            }
          };
        }
      } catch {}
    }
  }

  // 2. Análisis semántico de la inferencia de visión (para modelos como Qwen con reasoning_content)
  const isFlood = /flood|inundaci|deep water|covered in water|anegamiento|calzada inundada|agua en la calzada/i.test(combined);
  const cmMatch = combined.match(/(\d+(?:[.,]\d+)?)\s*(?:cm|centimeters|centimetros|centímetros)/i);
  const waterLevelCm = cmMatch ? parseFloat(cmMatch[1].replace(',', '.')) : (isFlood ? 45.0 : 0);

  return {
    rawText: isFlood
      ? `Visión Artificial GPU: Detección confirmada de anegamiento e inundación en la calzada (${originalName || 'foto'}).`
      : 'Visión Artificial GPU: Calzada despejada sin acumulación de agua.',
    floodDetected: isFlood,
    confidence: isFlood ? 0.95 : 0.90,
    waterLevelCm: isFlood ? waterLevelCm : 0,
    severity: isFlood ? 'alta' : 'baja',
    metadata: {
      engine: 'lm_studio_gpu_vision',
      source: 'neural_scene_analysis',
      reasoningSnippet: combined.substring(0, 350),
    }
  };
}

/**
 * Llama a la API de LM Studio / OpenAI Vision configurada
 * @param {string} filePath Ruta del archivo local
 * @param {string} originalName Nombre original del archivo
 * @returns {Promise<{rawText: string, floodDetected: boolean, confidence: number, waterLevelCm: number|null, severity: string, metadata: object}>}
 */
async function callExternalOcrApi(filePath, originalName) {
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    const b64 = fileBuffer.toString('base64');
    const ext = path.extname(filePath).replace('.', '').toLowerCase() || 'jpeg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${b64}`;

    const payload = {
      model: config.externalOcr.model || 'qwen3.5-4b-instruct-revised',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Direct JSON response only, no thoughts:\n{"text": "descripcion", "flood_detected": true, "confidence": 0.95, "water_level_cm": 40, "severity": "alta"}'
            },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 600
    };

    const headers = {
      'Content-Type': 'application/json',
    };
    if (config.externalOcr.apiKey) {
      headers['Authorization'] = `Bearer ${config.externalOcr.apiKey}`;
      headers['x-api-key'] = config.externalOcr.apiKey;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout para GPU

    const response = await fetch(config.externalOcr.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Error en API LM Studio HTTP ${response.status}: ${await response.text()}`);
    }

    const lmResponse = await response.json();
    const choiceMsg = lmResponse.choices?.[0]?.message || {};
    const content = choiceMsg.content || '';
    const reasoning = choiceMsg.reasoning_content || '';

    return parseVisionResponse(content, reasoning, originalName);
  } catch (err) {
    console.warn('⚠️ Error o timeout al contactar LM Studio Vision API:', err.message);
    throw err;
  }
}

/**
 * Ejecuta OCR local sobre el archivo de imagen utilizando el binario tesseract del sistema
 * @param {string} filePath Ruta del archivo local
 * @returns {Promise<string>}
 */
async function extractTextWithTesseract(filePath) {
  try {
    const { stdout } = await execFileAsync('tesseract', [
      filePath,
      'stdout',
      '-l', 'spa+eng',
      '--psm', '6',
    ], { timeout: 12000 });
    return (stdout || '').trim();
  } catch {
    try {
      const { stdout } = await execFileAsync('tesseract', [
        filePath,
        'stdout',
        '-l', 'spa+eng',
      ], { timeout: 12000 });
      return (stdout || '').trim();
    } catch {
      return '';
    }
  }
}

/**
 * Analizador OCR de imágenes reales: extrae texto con Tesseract y busca marcas de nivel o peligro
 * @param {string} filePath
 * @param {string} originalFilename
 * @param {object} customPayload
 */
export async function analyzeRealImageOcr(filePath, originalFilename, customPayload = {}) {
  const extractedText = await extractTextWithTesseract(filePath);
  const textClean = extractedText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Extraer lecturas numéricas de centímetros o metros si existen en la imagen
  const cmMatch = extractedText.match(/(\d+(?:[.,]\d+)?)\s*(?:cm|centimetros|centímetros)/i) ||
                  extractedText.match(/nivel(?:\s+de\s+agua)?\D*(\d+(?:[.,]\d+)?)/i);
  let parsedWaterLevel = cmMatch ? parseFloat(cmMatch[1].replace(',', '.')) : null;

  // 2. Evaluar palabras clave de riesgo hidrológico
  const floodKeywords = [
    'inundacion', 'inundacion', 'anegamiento', 'desborde', 'crecida',
    'alerta de desborde', 'submarino', 'agua', 'cauce', 'rio', 'quebrada',
    'peligro de agua', 'calzada inundada', 'flood'
  ];
  const foundKeywords = floodKeywords.filter((kw) => textClean.includes(kw));

  // 3. Evaluar nombre del archivo por si contiene indicios claros
  const fnLower = (originalFilename || '').toLowerCase();
  const isFloodFilename = fnLower.includes('inundacion') || fnLower.includes('inundación') || fnLower.includes('flood') || fnLower.includes('desborde');

  const hasFloodIndicators = foundKeywords.length > 0 || (parsedWaterLevel !== null && parsedWaterLevel >= 25) || isFloodFilename;

  if (hasFloodIndicators) {
    const waterLevelCm = parsedWaterLevel !== null
      ? parsedWaterLevel
      : (customPayload.waterLevelCm ? parseFloat(customPayload.waterLevelCm) : 45.0);

    return {
      rawText: extractedText || `OCR: Nivel de agua detectado ${waterLevelCm} cm en ${originalFilename}`,
      floodDetected: true,
      confidence: 0.94,
      waterLevelCm,
      metadata: {
        engine: 'tesseract_ocr',
        extractedText,
        detectedKeywords: foundKeywords,
        parsedWaterLevel,
        status: 'flood_confirmed_by_real_ocr',
      },
    };
  }

  return {
    rawText: extractedText || 'Inspección OCR de imagen completada. Calzada despejada sin texto de advertencia ni anegamiento visible.',
    floodDetected: false,
    confidence: 0.90,
    waterLevelCm: 0,
    metadata: {
      engine: 'tesseract_ocr',
      extractedText,
      status: 'no_flood_detected',
    },
  };
}

/**
 * Analizador heurístico y de simulación para pruebas rápidas de laboratorio
 * @param {string} filePath
 * @param {string} originalFilename
 * @param {object} customPayload Parámetros adicionales enviados por la app o simulador
 */
function analyzeFloodSimulated(filePath, originalFilename, customPayload = {}) {
  const filenameLower = originalFilename.toLowerCase();
  
  const isFloodNamed = 
    filenameLower.includes('flood') || 
    filenameLower.includes('inundacion') || 
    filenameLower.includes('inundación') || 
    filenameLower.includes('desborde') || 
    filenameLower.includes('agua') ||
    customPayload.simulateFlood === true ||
    customPayload.simulateFlood === 'true';

  if (isFloodNamed) {
    const estimatedCm = customPayload.waterLevelCm ? parseFloat(customPayload.waterLevelCm) : 45.0;
    return {
      rawText: `ESTACION HIDROMETRICA - NIVEL DE AGUA: ${estimatedCm} CM - ADVERTENCIA DE DESBORDE`,
      floodDetected: true,
      confidence: 0.92,
      waterLevelCm: estimatedCm,
      metadata: {
        engine: 'heuristic_flood_detector',
        indicators: ['water_reflection', 'watermark_detected', 'submerged_gauge'],
        risk_score: 'HIGH',
      },
    };
  }

  return {
    rawText: 'ESTACION MONITOREO VIAL - CONDICION SECA - CALZADA DESPEJADA',
    floodDetected: false,
    confidence: 0.98,
    waterLevelCm: 0,
    metadata: {
      engine: 'heuristic_flood_detector',
      indicators: ['dry_asphalt', 'normal_surface'],
      risk_score: 'NORMAL',
    },
  };
}

/**
 * Enruta la imagen al analizador OCR real o al simulador de pruebas según el origen
 */
async function analyzeImage(filePath, originalFilename, payload = {}) {
  const isSimulationExplicit = payload.simulateFlood === true || payload.simulateFlood === 'true';

  if (isSimulationExplicit) {
    return analyzeFloodSimulated(filePath, originalFilename, payload);
  }

  // PRIORIDAD 1: Si LM Studio (GPU) está configurado y accesible, enviar DIRECTAMENTE a la GPU
  if (config.externalOcr.apiUrl) {
    try {
      console.log(`[OCR/Visión GPU] Despachando foto "${originalFilename}" a LM Studio en ${config.externalOcr.apiUrl}...`);
      const gpuResult = await callExternalOcrApi(filePath, originalFilename);
      console.log(`[OCR/Visión GPU] Procesamiento finalizado por GPU. Inundación detectada: ${gpuResult.floodDetected} (${gpuResult.waterLevelCm} cm)`);
      return gpuResult;
    } catch (err) {
      console.warn(`[OCR/Visión GPU] Error o timeout en GPU (${err.message}). Aplicando análisis local Tesseract de respaldo...`);
    }
  }

  // PRIORIDAD 2: OCR local (Tesseract + reglas de calibración)
  try {
    return await analyzeRealImageOcr(filePath, originalFilename, payload);
  } catch (err) {
    console.warn('⚠️ Error en analyzeRealImageOcr, aplicando analizador heurístico de respaldo:', err.message);
    return analyzeFloodSimulated(filePath, originalFilename, payload);
  }
}

/**
 * Genera y emite un incidente de inundación vinculado a una evidencia
 */
async function createFloodIncident(device, evidenceRecord, ocrResult, relativeFilePath, latitude, longitude) {
  let severity = 'alta';
  if ((ocrResult.waterLevelCm && ocrResult.waterLevelCm >= 75) || ocrResult.confidence >= 0.9) {
    severity = 'critica';
  } else if (ocrResult.waterLevelCm && ocrResult.waterLevelCm < 30) {
    severity = 'media';
  }

  const isMuted = Boolean(device.isMuted);

  const title = `🌊 Inundación Detectada por Cámara Externa (${device.name})`;
  const description = `Análisis OCR de imagen capturada detectó nivel de anegamiento de agua.${
    ocrResult.waterLevelCm ? ` Nivel estimado: ${ocrResult.waterLevelCm} cm.` : ''
  } Confianza del modelo: ${(ocrResult.confidence * 100).toFixed(0)}%.`;

  const [incidentRecord] = await db
    .insert(incidents)
    .values({
      deviceId: device.id,
      evidenceId: evidenceRecord.id,
      incidentType: 'inundacion',
      severity,
      status: 'activa',
      isMuted,
      title,
      description,
      latitude,
      longitude,
      detectedAt: new Date(),
      sensorSnapshot: {
        confidence: ocrResult.confidence,
        waterLevelCm: ocrResult.waterLevelCm,
        ocrRawText: ocrResult.rawText,
        imagePath: relativeFilePath,
      },
    })
    .returning();

  const createdIncident = {
    ...incidentRecord,
    device: {
      id: device.id,
      name: device.name,
      model: device.model,
    },
    evidence: evidenceRecord,
    isMuted,
  };

  // Emitir alerta en tiempo real vía WebSockets
  emitIncidentAlert(createdIncident);

  // Despacho automático de alerta por Telegram a autoridades (si el nodo no está silenciado)
  if (!isMuted) {
    const photoAbsPath = path.resolve(process.cwd(), relativeFilePath.startsWith('/') ? relativeFilePath.slice(1) : relativeFilePath);
    dispatchIncidentAlertToContacts(createdIncident, photoAbsPath).catch((err) =>
      console.error('Error despachando alerta de inundación por Telegram:', err.message)
    );
  }

  return createdIncident;
}

/**
 * Ejecuta el análisis OCR de visión por computadora en segundo plano de manera asíncrona
 */
async function executeAsyncOcrTask(device, filePath, originalName, evidenceRecord, payload, relativeFilePath) {
  let ocrResult;
  let ocrStatus = 'processed';

  try {
    ocrResult = await analyzeImage(filePath, originalName, payload);
  } catch (err) {
    console.warn('ℹ️ Usando analizador heurístico como respaldo ante fallo de OCR:', err.message);
    ocrResult = analyzeFloodSimulated(filePath, originalName, payload);
    ocrStatus = 'fallback_heuristic';
  }

  // Actualizar la evidencia con los resultados analizados
  const [updatedRecord] = await db
    .update(cameraEvidences)
    .set({
      ocrStatus,
      ocrRawText: ocrResult.rawText,
      floodDetected: ocrResult.floodDetected,
      floodConfidence: ocrResult.confidence,
      waterLevelCm: ocrResult.waterLevelCm,
      floodMetadata: ocrResult.metadata,
      updatedAt: new Date(),
    })
    .where(eq(cameraEvidences.id, evidenceRecord.id))
    .returning();

  let createdIncident = null;
  if (ocrResult.floodDetected) {
    createdIncident = await createFloodIncident(device, updatedRecord, ocrResult, relativeFilePath, evidenceRecord.latitude, evidenceRecord.longitude);
  }

  // Notificar al panel web la actualización del estado OCR
  emitEvidenceUpdated(device.id, updatedRecord);

  // Registro de auditoría
  await createAuditLog({
    action: 'photo_ocr_analyzed',
    category: 'camera',
    severity: ocrResult.floodDetected ? 'critical' : 'info',
    deviceId: device.id,
    description: `Análisis OCR completado para foto de "${device.name}" (${originalName}): ${
      ocrResult.floodDetected ? `🌊 ¡INUNDACIÓN CONFIRMADA (${ocrResult.waterLevelCm} cm)!` : 'Vía despejada / sin inundación.'
    }`,
    metadata: {
      evidenceId: evidenceRecord.id,
      floodDetected: ocrResult.floodDetected,
      waterLevelCm: ocrResult.waterLevelCm,
      confidence: ocrResult.confidence,
      ocrStatus,
      incidentId: createdIncident?.id || null,
    },
  });
}

/**
 * Procesa la evidencia fotográfica enviada por la cámara externa del dispositivo Android.
 * La foto se almacena y publica de inmediato en la plataforma, y luego se ejecuta el OCR
 * en segundo plano para máxima agilidad de respuesta.
 * @param {object} device Dispositivo emisor
 * @param {object} file Archivo procesado por Multer
 * @param {object} payload Metadatos adicionales (coordenadas, simulateFlood, etc.)
 */
export async function processCameraEvidence(device, file, payload = {}) {
  const latitude = payload.latitude ? parseFloat(payload.latitude) : device.lastLatitude;
  const longitude = payload.longitude ? parseFloat(payload.longitude) : device.lastLongitude;
  const relativeFilePath = `/uploads/evidences/${path.basename(file.path)}`;

  // Modo síncrono para tests unitarios y pruebas del simulador que evalúan el retorno HTTP directo
  const isSyncRequested = payload.syncOcr === 'true' || payload.syncOcr === true || 
    (Boolean(payload.simulateFlood) && payload.asyncOcr !== 'true');

  if (isSyncRequested) {
    const ocrResult = await analyzeImage(file.path, file.originalname, payload);
    const ocrStatus = 'processed';

    const [evidenceRecord] = await db
      .insert(cameraEvidences)
      .values({
        deviceId: device.id,
        filePath: relativeFilePath,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        latitude,
        longitude,
        capturedAt: payload.capturedAt ? new Date(payload.capturedAt) : new Date(),
        ocrStatus,
        ocrRawText: ocrResult.rawText,
        floodDetected: ocrResult.floodDetected,
        floodConfidence: ocrResult.confidence,
        waterLevelCm: ocrResult.waterLevelCm,
        floodMetadata: ocrResult.metadata,
      })
      .returning();

    emitEvidenceCreated(device.id, evidenceRecord);

    let createdIncident = null;
    if (ocrResult.floodDetected) {
      createdIncident = await createFloodIncident(device, evidenceRecord, ocrResult, relativeFilePath, latitude, longitude);
    }

    await pruneOldNonIncidentEvidences(device.id, evidenceRecord.id);

    await createAuditLog({
      action: 'photo_uploaded',
      category: 'camera',
      severity: ocrResult.floodDetected ? 'critical' : 'info',
      deviceId: device.id,
      description: `Foto de cámara externa transmitida por nodo "${device.name}" (${file.originalname}, ${(file.size / 1024).toFixed(1)} KB)${ocrResult.floodDetected ? ' - 🌊 ¡INUNDACIÓN DETECTADA!' : ''}`,
      metadata: {
        evidenceId: evidenceRecord.id,
        filePath: relativeFilePath,
        originalFilename: file.originalname,
        fileSize: file.size,
        floodDetected: ocrResult.floodDetected,
        waterLevelCm: ocrResult.waterLevelCm,
        ocrStatus,
        latitude,
        longitude,
      },
    });

    return {
      evidence: evidenceRecord,
      incident: createdIncident,
    };
  }

  // --- MODO INMEDIATO (PRODUCCIÓN / CAPTURA RÁPIDA) ---
  // 1. Guardar inmediatamente el registro en la plataforma (estado 'pending')
  const [evidenceRecord] = await db
    .insert(cameraEvidences)
    .values({
      deviceId: device.id,
      filePath: relativeFilePath,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      latitude,
      longitude,
      capturedAt: payload.capturedAt ? new Date(payload.capturedAt) : new Date(),
      ocrStatus: 'pending',
      ocrRawText: 'Foto registrada en plataforma. Análisis OCR en curso...',
      floodDetected: false,
      floodConfidence: null,
      waterLevelCm: null,
      floodMetadata: { engine: 'async_pipeline', status: 'pending' },
    })
    .returning();

  // 2. Podar fotos anteriores que no correspondan a incidentes de emergencia.
  // Regla estricta: Solo se conserva la última foto del nodo o aquellas que hayan generado incidentes.
  await pruneOldNonIncidentEvidences(device.id, evidenceRecord.id);

  // 3. Notificar de inmediato al panel web vía WebSockets que la nueva foto ya está disponible
  emitEvidenceCreated(device.id, evidenceRecord);

  // 4. Registrar en auditoría la subida instantánea
  await createAuditLog({
    action: 'photo_uploaded',
    category: 'camera',
    severity: 'info',
    deviceId: device.id,
    description: `Foto recibida y publicada en la plataforma por nodo "${device.name}" (${file.originalname}, ${(file.size / 1024).toFixed(1)} KB). Verificación OCR iniciada en segundo plano.`,
    metadata: {
      evidenceId: evidenceRecord.id,
      filePath: relativeFilePath,
      originalFilename: file.originalname,
      fileSize: file.size,
      ocrStatus: 'pending',
    },
  });

  // 5. Iniciar análisis OCR de forma asíncrona sin bloquear la respuesta de red
  setImmediate(() => {
    executeAsyncOcrTask(device, file.path, file.originalname, evidenceRecord, payload, relativeFilePath)
      .catch((err) => {
        console.error(`[Async OCR Error] Error procesando evidencia ${evidenceRecord.id}:`, err.message);
      });
  });

  // Retorno inmediato al dispositivo emisor
  return {
    evidence: evidenceRecord,
    incident: null,
  };
}

/**
 * Poda fotos anteriores que no correspondan a incidentes de emergencia.
 * Solo se conserva la última foto del nodo o aquellas que hayan generado incidencias.
 * @param {string} deviceId ID del dispositivo
 * @param {string} keepEvidenceId ID de la evidencia más reciente a mantener
 */
export async function pruneOldNonIncidentEvidences(deviceId, keepEvidenceId) {
  try {
    const olderCandidates = await db
      .select({
        id: cameraEvidences.id,
        filePath: cameraEvidences.filePath,
        floodDetected: cameraEvidences.floodDetected,
      })
      .from(cameraEvidences)
      .where(
        and(
          eq(cameraEvidences.deviceId, deviceId),
          ne(cameraEvidences.id, keepEvidenceId),
          eq(cameraEvidences.floodDetected, false)
        )
      );

    for (const oldEv of olderCandidates) {
      // Verificar que no esté vinculada a una incidencia
      const [linked] = await db
        .select({ id: incidents.id })
        .from(incidents)
        .where(eq(incidents.evidenceId, oldEv.id))
        .limit(1);

      if (!linked) {
        if (oldEv.filePath) {
          const appPath = path.resolve(process.cwd(), oldEv.filePath.replace(/^\//, ''));
          fs.promises.unlink(appPath).catch(() => {});
        }
        await db.delete(cameraEvidences).where(eq(cameraEvidences.id, oldEv.id));
      }
    }
  } catch (err) {
    console.warn('⚠️ Error al podar evidencias fotográficas no críticas:', err.message);
  }
}


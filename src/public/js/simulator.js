/**
 * Simulador de Telemetría de Dispositivo Android (Banco de Pruebas Integrado)
 */

let simulatorDevices = [];

/**
 * Inicializa el simulador y enlaza los eventos de prueba
 */
function initSimulator() {
  const deviceSelect = document.getElementById('sim-device-select');
  const activeKeyDisplay = document.getElementById('sim-active-key');
  const batterySlider = document.getElementById('sim-battery-slider');
  const batteryVal = document.getElementById('sim-battery-val');

  if (batterySlider && batteryVal) {
    batterySlider.addEventListener('input', (e) => {
      batteryVal.textContent = `${e.target.value}%`;
    });
  }

  if (deviceSelect) {
    deviceSelect.addEventListener('change', () => {
      const selected = simulatorDevices.find((d) => d.id === deviceSelect.value);
      if (selected && activeKeyDisplay) {
        activeKeyDisplay.textContent = selected.apiKey || 'dev_token_...';
      }
    });
  }

  // 1. Botón: Enviar Telemetría Normal
  document.getElementById('sim-send-accel-normal')?.addEventListener('click', async () => {
    await sendTelemetryData(false);
  });

  // 2. Botón: Simular Sismo Fuerte
  document.getElementById('sim-send-accel-quake')?.addEventListener('click', async () => {
    await sendTelemetryData(true);
  });

  // 3. Botón: Subir Foto & Verificar Inundación
  document.getElementById('sim-send-photo-btn')?.addEventListener('click', async () => {
    await sendPhotoEvidence();
  });

  // 4. Botón: Enviar Heartbeat
  document.getElementById('sim-send-heartbeat-btn')?.addEventListener('click', async () => {
    await sendHeartbeatData();
  });
}

/**
 * Actualiza la lista de dispositivos en el selector del simulador
 * @param {Array} devices
 */
function setSimulatorDevices(devices) {
  simulatorDevices = devices;
  const select = document.getElementById('sim-device-select');
  const activeKeyDisplay = document.getElementById('sim-active-key');
  if (!select) return;

  select.innerHTML = '';
  devices.forEach((dev) => {
    const opt = document.createElement('option');
    opt.value = dev.id;
    opt.textContent = `${dev.name} (${dev.model || 'Android'})`;
    select.appendChild(opt);
  });

  if (devices.length > 0 && activeKeyDisplay) {
    activeKeyDisplay.textContent = devices[0].apiKey || 'dev_token_default';
  }
}

/**
 * Obtiene el dispositivo actualmente seleccionado y sus credenciales
 */
function getSelectedDevice() {
  const select = document.getElementById('sim-device-select');
  if (!select || !select.value) return null;
  return simulatorDevices.find((d) => d.id === select.value) || null;
}

/**
 * Envía datos de acelerómetro y GPS al endpoint de telemetría
 * @param {boolean} isQuakeSpike Si es true, envía valores que exceden el umbral de sismo
 */
async function sendTelemetryData(isQuakeSpike) {
  const device = getSelectedDevice();
  if (!device) {
    alert('Por favor selecciona un dispositivo primero.');
    return;
  }

  let accelX = parseFloat(document.getElementById('sim-accel-x')?.value || '0.2');
  let accelY = parseFloat(document.getElementById('sim-accel-y')?.value || '0.1');
  let accelZ = parseFloat(document.getElementById('sim-accel-z')?.value || '9.8');

  if (isQuakeSpike) {
    // Pico de sacudida sísmica violenta (> 18 m/s²)
    accelX = 7.4;
    accelY = 9.8;
    accelZ = 14.2;
  }

  const payload = {
    accelX,
    accelY,
    accelZ,
    latitude: device.location?.latitude || -33.4372,
    longitude: device.location?.longitude || -70.6506,
    altitude: 570.0,
    accuracy: 4.2,
    speed: 0.0,
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch('/api/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': device.apiKey || 'dev_token_alfa_scl_2026',
        'x-device-identifier': device.deviceIdentifier,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (result.success) {
      if (result.incident) {
        showToast('🚨 Sismo Detectado', `Alerta sísmica generada con magnitud ${result.telemetry.magnitude} m/s²`, 'danger');
      } else {
        showToast('📡 Telemetría Enviada', `Magnitud registrada: ${result.telemetry.magnitude} m/s²`, 'success');
      }
    } else {
      showToast('Error', result.error, 'danger');
    }
  } catch (err) {
    showToast('Error de Conexión', err.message, 'danger');
  }
}

/**
 * Genera una imagen sintética en canvas si el usuario no cargó un archivo
 */
function createSyntheticCanvasImage(textLabel, isFlood) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');

  // Fondo simulado (agua o calle)
  if (isFlood) {
    const grad = ctx.createLinearGradient(0, 0, 0, 480);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(0.4, '#0f172a');
    grad.addColorStop(0.6, '#0369a1');
    grad.addColorStop(1, '#0c4a6e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    // Ondas de agua
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    for (let y = 300; y < 480; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(160, y - 15, 320, y + 15, 640, y);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 640, 480);
  }

  // Estampado de fecha y texto OCR
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(20, 20, 600, 70);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(textLabel, 35, 55);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px monospace';
  ctx.fillText(`CAM-EXT-01 | ${new Date().toISOString()}`, 35, 78);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/jpeg');
  });
}

/**
 * Sube una captura de foto de cámara externa y dispara el análisis de inundación
 */
async function sendPhotoEvidence() {
  const device = getSelectedDevice();
  if (!device) {
    alert('Por favor selecciona un dispositivo primero.');
    return;
  }

  const fileInput = document.getElementById('sim-photo-file');
  const isFloodChecked = document.getElementById('sim-photo-flood-check')?.checked;
  const waterLevel = document.getElementById('sim-water-level')?.value || '65';

  const formData = new FormData();
  formData.append('latitude', String(device.location?.latitude || -33.4372));
  formData.append('longitude', String(device.location?.longitude || -70.6506));
  formData.append('simulateFlood', isFloodChecked ? 'true' : 'false');
  formData.append('waterLevelCm', waterLevel);

  if (fileInput && fileInput.files.length > 0) {
    formData.append('photo', fileInput.files[0]);
  } else {
    // Generar imagen sintética
    const label = isFloodChecked 
      ? `ALERTA: REGISTRO DE AGUA: ${waterLevel} CM - INUNDACION` 
      : 'MONITOREO VIAL: SUPERFICIE SECA';
    const blob = await createSyntheticCanvasImage(label, isFloodChecked);
    formData.append('photo', blob, isFloodChecked ? 'evidence_inundacion_test.jpg' : 'evidence_calzada_normal.jpg');
  }

  try {
    const response = await fetch('/api/evidence/upload', {
      method: 'POST',
      headers: {
        'x-api-key': device.apiKey || 'dev_token_alfa_scl_2026',
        'x-device-identifier': device.deviceIdentifier,
      },
      body: formData,
    });

    const result = await response.json();
    if (result.success) {
      if (result.evidence.floodDetected) {
        showToast('🌊 Inundación Detectada', `OCR detectó anegamiento (${result.evidence.waterLevelCm} cm). Alerta generada.`, 'danger');
      } else {
        showToast('📷 Foto Recibida', 'Evidencia analizada: Calzada sin inundación.', 'info');
      }
      // Refrescar tabla de reportes
      if (window.loadReports) window.loadReports();
    } else {
      showToast('Error', result.error, 'danger');
    }
  } catch (err) {
    showToast('Error', err.message, 'danger');
  }
}

/**
 * Envía pulso vital de heartbeat
 */
async function sendHeartbeatData() {
  const device = getSelectedDevice();
  if (!device) {
    alert('Por favor selecciona un dispositivo primero.');
    return;
  }

  const batteryLevel = parseInt(document.getElementById('sim-battery-slider')?.value || '85', 10);
  const isCharging = document.getElementById('sim-charging-check')?.checked || false;
  const batteryTemp = parseFloat(document.getElementById('sim-battery-temp')?.value || '28.5');
  const cpuTemp = parseFloat(document.getElementById('sim-cpu-temp')?.value || '34.0');

  const payload = {
    batteryLevel,
    isCharging,
    batteryTemp,
    cpuTemp,
    wifiSsid: 'RedEmergencia_5G',
    signalStrength: -60,
  };

  try {
    const response = await fetch('/api/heartbeat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': device.apiKey || 'dev_token_alfa_scl_2026',
        'x-device-identifier': device.deviceIdentifier,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (result.success) {
      showToast('💓 Heartbeat Registrado', `Batería: ${batteryLevel}% | Temp: ${batteryTemp}°C`, 'success');
      if (window.loadDevices) window.loadDevices();
    } else {
      showToast('Error', result.error, 'danger');
    }
  } catch (err) {
    showToast('Error', err.message, 'danger');
  }
}

window.initSimulator = initSimulator;
window.setSimulatorDevices = setSimulatorDevices;

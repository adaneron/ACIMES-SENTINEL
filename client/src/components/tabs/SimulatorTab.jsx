import { useState } from 'react';
import { Activity, Camera, BatteryCharging, Send, AlertTriangle, Waves, Zap, Terminal } from 'lucide-react';

export default function SimulatorTab({
  devices = [],
  onShowToast,
  onRefreshData
}) {
  const [selectedDeviceId, setSelectedDeviceId] = useState(devices[0]?.id || '');
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) || devices[0];
  
  // Acelerómetro & GPS (Barcelona, Anzoátegui, Venezuela por defecto)
  const [accelX, setAccelX] = useState(0.2);
  const [accelY, setAccelY] = useState(0.1);
  const [accelZ, setAccelZ] = useState(9.81);
  const [lat, setLat] = useState(() => selectedDevice?.location?.latitude || selectedDevice?.lastLatitude || 10.1367);
  const [lng, setLng] = useState(() => selectedDevice?.location?.longitude || selectedDevice?.lastLongitude || -64.6860);

  // Cámara & Inundación
  const [simulateFlood, setSimulateFlood] = useState(true);
  const [waterLevelCm, setWaterLevelCm] = useState(65);
  const [selectedFile, setSelectedFile] = useState(null);

  // Heartbeat
  const [batteryLevel, setBatteryLevel] = useState(85);
  const [isCharging, setIsCharging] = useState(false);
  const [batteryTemp, setBatteryTemp] = useState(28.5);
  const [cpuTemp, setCpuTemp] = useState(34.2);

  // Terminal de registro
  const [consoleLogs, setConsoleLogs] = useState(() => [
    { id: 1, time: new Date().toLocaleTimeString(), type: 'info', text: 'Banco de pruebas Android Sentinel inicializado.' }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addLog = (type, text) => {
    setConsoleLogs((prev) => [
      { id: Date.now(), time: new Date().toLocaleTimeString(), type, text },
      ...prev.slice(0, 49)
    ]);
  };

  // Crear imagen sintética en canvas para pruebas sin archivo local
  const createSyntheticEvidence = (isFlood, level) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');

      if (isFlood) {
        const grad = ctx.createLinearGradient(0, 0, 0, 480);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.35, '#1e293b');
        grad.addColorStop(0.55, '#0369a1');
        grad.addColorStop(1, '#082f49');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 640, 480);

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        for (let y = 280; y < 480; y += 28) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(160, y - 12, 320, y + 12, 640, y);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 640, 480);
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(20, 20, 600, 75);

      ctx.fillStyle = isFlood ? '#ef4444' : '#22c55e';
      ctx.font = 'bold 18px monospace';
      const label = isFlood
        ? `ALERTA OCR: REGISTRO DE AGUA ${level} CM - INUNDACIÓN`
        : 'MONITOREO VIAL: SUPERFICIE SECA / NORMAL';
      ctx.fillText(label, 35, 52);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px monospace';
      ctx.fillText(`CAM-EXT-01 | NODO: ${selectedDevice?.deviceIdentifier || 'SIMULADOR'} | ${new Date().toISOString()}`, 35, 78);

      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg');
    });
  };

  // 1. Enviar Telemetría (Sismo / Normal)
  const handleSendTelemetry = async (isQuakeSpike = false) => {
    if (!selectedDevice) {
      if (onShowToast) onShowToast('Selecciona un dispositivo primero', 'warning');
      return;
    }

    setIsSubmitting(true);
    let curX = parseFloat(accelX);
    let curY = parseFloat(accelY);
    let curZ = parseFloat(accelZ);

    if (isQuakeSpike) {
      curX = 7.4;
      curY = 9.8;
      curZ = 14.2;
      setAccelX(curX);
      setAccelY(curY);
      setAccelZ(curZ);
    }

    const payload = {
      accelX: curX,
      accelY: curY,
      accelZ: curZ,
      latitude: parseFloat(lat) || 10.1367,
      longitude: parseFloat(lng) || -64.6860,
      altitude: 570.0,
      accuracy: 3.5,
      speed: 0.0,
      timestamp: new Date().toISOString()
    };

    try {
      addLog('info', `Transmitiendo telemetría a /api/telemetry (${selectedDevice.name})...`);
      const res = await fetch('/api/telemetry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': selectedDevice.apiKey || 'dev_token_alfa_scl_2026',
          'x-device-identifier': selectedDevice.deviceIdentifier
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        const mag = data.telemetry?.magnitude || Math.sqrt(curX*curX + curY*curY + curZ*curZ).toFixed(2);
        if (data.incident) {
          addLog('danger', `🚨 ALERTA SÍSMICA GENERADA: Magnitud ${mag} m/s² (Incidente #${data.incident.id})`);
          if (onShowToast) onShowToast(`🚨 Sismo Detectado (${mag} m/s²)`, 'danger');
        } else {
          addLog('success', `Telemetría recibida con éxito. Magnitud: ${mag} m/s² (Normal)`);
          if (onShowToast) onShowToast(`Telemetría OK (${mag} m/s²)`, 'success');
        }
        if (onRefreshData) onRefreshData();
      } else {
        addLog('danger', `Error en API: ${data.error}`);
        if (onShowToast) onShowToast(data.error, 'danger');
      }
    } catch (err) {
      addLog('danger', `Fallo de red: ${err.message}`);
      if (onShowToast) onShowToast(err.message, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Subir Foto & Verificar OCR
  const handleSendEvidence = async (forceSynthetic = false) => {
    if (!selectedDevice) {
      if (onShowToast) onShowToast('Selecciona un dispositivo primero', 'warning');
      return;
    }

    if (!selectedFile && !forceSynthetic) {
      if (onShowToast) onShowToast('Selecciona una imagen real para analizar con OCR', 'warning');
      addLog('warning', '⚠️ Debe seleccionar un archivo de imagen real antes de subir.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isUsingRealFile = Boolean(selectedFile && !forceSynthetic);
      addLog('info', isUsingRealFile
        ? `Enviando imagen real "${selectedFile.name}" (${(selectedFile.size / 1024).toFixed(1)} KB) para análisis OCR con Tesseract...`
        : `Preparando imagen de prueba sintética (Simular inundación: ${simulateFlood ? 'SÍ' : 'NO'})...`
      );

      const formData = new FormData();
      formData.append('latitude', String(lat));
      formData.append('longitude', String(lng));
      formData.append('syncOcr', 'true');

      if (isUsingRealFile) {
        formData.append('photo', selectedFile);
        formData.append('simulateFlood', 'false');
      } else {
        formData.append('simulateFlood', simulateFlood ? 'true' : 'false');
        formData.append('waterLevelCm', String(waterLevelCm));
        const syntheticBlob = await createSyntheticEvidence(simulateFlood, waterLevelCm);
        formData.append('photo', syntheticBlob, simulateFlood ? 'test_flood_ocr.jpg' : 'test_normal_surface.jpg');
      }

      const res = await fetch('/api/evidence/upload', {
        method: 'POST',
        headers: {
          'x-api-key': selectedDevice.apiKey || 'dev_token_alfa_scl_2026',
          'x-device-identifier': selectedDevice.deviceIdentifier
        },
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        const ev = data.evidence;
        const ocrText = ev?.ocrRawText ? ev.ocrRawText.trim() : 'Sin texto detectado';
        addLog('info', `📄 Texto extraído por OCR:\n"${ocrText.substring(0, 160)}${ocrText.length > 160 ? '...' : ''}"`);

        if (ev?.floodDetected) {
          addLog('danger', `🌊 ¡INUNDACIÓN CONFIRMADA POR OCR! Nivel estimado: ${ev.waterLevelCm ?? '--'} cm.`);
          if (onShowToast) onShowToast(`🌊 Inundación Detectada por OCR (${ev.waterLevelCm ?? '--'} cm)`, 'danger');
        } else {
          addLog('success', '✅ Foto analizada por OCR: Vía normal / Sin indicios de anegamiento.');
          if (onShowToast) onShowToast('Foto analizada: Sin inundación', 'info');
        }
        if (onRefreshData) onRefreshData();
      } else {
        addLog('danger', `Error en API: ${data.error}`);
        if (onShowToast) onShowToast(data.error, 'danger');
      }
    } catch (err) {
      addLog('danger', `Fallo al procesar OCR: ${err.message}`);
      if (onShowToast) onShowToast(err.message, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Emitir Heartbeat
  const handleSendHeartbeat = async () => {
    if (!selectedDevice) {
      if (onShowToast) onShowToast('Selecciona un dispositivo primero', 'warning');
      return;
    }

    setIsSubmitting(true);
    const payload = {
      batteryLevel: parseInt(batteryLevel, 10),
      isCharging: Boolean(isCharging),
      batteryTemp: parseFloat(batteryTemp),
      cpuTemp: parseFloat(cpuTemp),
      wifiSsid: 'Sentinel_5G_EmergencyMesh',
      signalStrength: -58
    };

    try {
      addLog('info', `Transmitiendo pulso vital (Heartbeat) para ${selectedDevice.name}...`);
      const res = await fetch('/api/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': selectedDevice.apiKey || 'dev_token_alfa_scl_2026',
          'x-device-identifier': selectedDevice.deviceIdentifier
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        addLog('success', `Heartbeat registrado. Batería: ${batteryLevel}%, Temp: ${batteryTemp}°C`);
        if (onShowToast) onShowToast(`Heartbeat Registrado (${batteryLevel}%)`, 'success');
        if (onRefreshData) onRefreshData();
      } else {
        addLog('danger', `Error en Heartbeat: ${data.error}`);
        if (onShowToast) onShowToast(data.error, 'danger');
      }
    } catch (err) {
      addLog('danger', `Fallo al enviar heartbeat: ${err.message}`);
      if (onShowToast) onShowToast(err.message, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Top Banner / Device Target Selector */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              BANCO DE PRUEBAS
            </span>
            <span className="text-xs font-mono text-slate-400">
              SIMULADOR DE TELEMETRÍA ANDROID
            </span>
          </div>
          <h2 className="text-xl font-black text-white tracking-wide">
            Inyector de Señales y Eventos Críticos
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Permite probar el motor de detección de sismos, análisis OCR de inundaciones y telemetría de batería en tiempo real.
          </p>
        </div>

        {/* Device selector */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Dispositivo Destino
            </span>
            <span className="text-xs font-mono text-slate-300">
              {selectedDevice?.deviceIdentifier || 'Ninguno seleccionado'}
            </span>
          </div>
          <select
            value={selectedDeviceId}
            onChange={(e) => {
              setSelectedDeviceId(e.target.value);
              const dev = devices.find((d) => d.id === e.target.value);
              const devLat = dev?.location?.latitude ?? dev?.lastLatitude;
              const devLng = dev?.location?.longitude ?? dev?.lastLongitude;
              if (devLat != null && devLng != null) {
                setLat(parseFloat(devLat));
                setLng(parseFloat(devLng));
              }
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.model || 'Android'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3 Simulation Modules */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* MÓDULO 1: ACELERÓMETRO & SISMO */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Sensor Sísmico (Acelerómetro)</h3>
                  <span className="text-[10px] font-mono text-slate-400">Umbral Alerta: 14.50 m/s²</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Eje X (m/s²)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={accelX}
                    onChange={(e) => setAccelX(parseFloat(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-center focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Eje Y (m/s²)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={accelY}
                    onChange={(e) => setAccelY(parseFloat(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-center focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Eje Z (m/s²)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={accelZ}
                    onChange={(e) => setAccelZ(parseFloat(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-center focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Magnitud Resultante */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">Vector Magnitud:</span>
                <span className={`text-base font-black ${Math.sqrt(accelX*accelX + accelY*accelY + accelZ*accelZ) > 14.5 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
                  {Math.sqrt(accelX*accelX + accelY*accelY + accelZ*accelZ).toFixed(2)} m/s²
                </span>
              </div>

              {/* Coordenadas */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Latitud GPS</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={lat}
                    onChange={(e) => setLat(parseFloat(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Longitud GPS</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={lng}
                    onChange={(e) => setLng(parseFloat(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-6">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSendTelemetry(false)}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs tracking-wider uppercase font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center justify-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              Enviar Telemetría Normal
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSendTelemetry(true)}
              className="w-full py-2.5 px-4 rounded-xl font-black text-xs tracking-wider uppercase font-mono bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-lg shadow-red-900/30 transition-all flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Simular Sismo Fuerte (&gt;14.5 m/s²)
            </button>
          </div>
        </div>

        {/* MÓDULO 2: CÁMARA & OCR INUNDACIÓN */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Cámara Externa &amp; Visión OCR</h3>
                  <span className="text-[10px] font-mono text-slate-400">Motor OCR Tesseract 5.5 + Visión IA</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 font-mono text-xs">
              {/* Selector de Archivo Real */}
              <div className={`p-3 rounded-xl border ${selectedFile ? 'bg-cyan-950/30 border-cyan-500/50' : 'bg-slate-950/80 border-slate-800'}`}>
                <label className="text-[11px] font-bold text-slate-200 block mb-1.5 flex items-center justify-between">
                  <span>📸 Subir Archivo de Foto Real</span>
                  {selectedFile && <span className="text-cyan-400 text-[10px] font-normal">Archivo cargado</span>}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-[11px] text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-mono file:bg-cyan-600 file:text-white hover:file:bg-cyan-500 cursor-pointer"
                />
                {selectedFile ? (
                  <div className="mt-2 text-[10px] text-cyan-300 font-mono flex items-center justify-between">
                    <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                    <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-500 mt-1.5 block">
                    Sube una foto real de carretera, regleta métrica o cartel de emergencia para analizar con OCR.
                  </span>
                )}
              </div>

              {/* Parámetros de Simulación Alternativa (cuando no se tiene archivo) */}
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-2 font-bold">
                  Opciones de Prueba Sintética (Generador)
                </span>

                <label className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={simulateFlood}
                    onChange={(e) => setSimulateFlood(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700 focus:ring-0"
                  />
                  <div className="flex-1">
                    <span className="text-xs font-medium text-slate-300 block">
                      Simular Marca de Inundación en Generador
                    </span>
                  </div>
                </label>

                {/* Slider Nivel de Agua */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Nivel de Agua Simulado:</span>
                    <span className={`font-black ${waterLevelCm >= 50 ? 'text-red-400' : 'text-cyan-400'}`}>
                      {waterLevelCm} cm
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="140"
                    step="5"
                    value={waterLevelCm}
                    onChange={(e) => setWaterLevelCm(parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSendEvidence(false)}
              className="w-full py-3 px-4 rounded-xl font-bold text-xs tracking-wider uppercase font-mono bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Waves className="w-4 h-4" />
              {selectedFile ? 'Subir Foto Seleccionada & Analizar con OCR' : 'Subir Foto & Analizar con OCR'}
            </button>

            {!selectedFile && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSendEvidence(true)}
                className="w-full py-2 px-3 rounded-lg text-[11px] font-mono font-medium text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Generar muestra sintética de prueba</span>
              </button>
            )}
          </div>
        </div>

        {/* MÓDULO 3: HEARTBEAT & ENERGÍA */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <BatteryCharging className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Pulso Vital (Heartbeat)</h3>
                  <span className="text-[10px] font-mono text-slate-400">Estado de red y hardware</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 font-mono text-xs">
              {/* Slider Batería */}
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Nivel de Batería:</span>
                  <span className={`font-black ${batteryLevel < 20 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {batteryLevel}%
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={batteryLevel}
                  onChange={(e) => setBatteryLevel(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Cargador Conectado */}
              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCharging}
                  onChange={(e) => setIsCharging(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-0"
                />
                <div>
                  <span className="text-xs font-bold text-white block">Conectado a la Corriente (AC)</span>
                  <span className="text-[10px] text-slate-400">Simula carga activa de batería</span>
                </div>
              </label>

              {/* Temperaturas */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Temp Batería (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={batteryTemp}
                    onChange={(e) => setBatteryTemp(parseFloat(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-center focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Temp CPU (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={cpuTemp}
                    onChange={(e) => setCpuTemp(parseFloat(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-center focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSendHeartbeat}
              className="w-full py-3 px-4 rounded-xl font-bold text-xs tracking-wider uppercase font-mono bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Emitir Pulso Vital (Heartbeat)
            </button>
          </div>
        </div>

      </div>

      {/* Terminal de Auditoría / Consola del Simulador */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-xs">
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-slate-400">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-[11px] tracking-wider uppercase text-slate-300">
              Registro de Operaciones del Simulador
            </span>
          </div>
          <button
            type="button"
            onClick={() => setConsoleLogs([])}
            className="text-[10px] text-slate-500 hover:text-slate-300 underline"
          >
            Limpiar registro
          </button>
        </div>

        <div className="h-36 overflow-y-auto space-y-1.5 pr-2 tactical-scrollbar">
          {consoleLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 text-[11px]">
              <span className="text-slate-600 select-none">[{log.time}]</span>
              <span
                className={
                  log.type === 'danger'
                    ? 'text-red-400 font-bold'
                    : log.type === 'success'
                    ? 'text-emerald-400 font-bold'
                    : 'text-slate-300'
                }
              >
                {log.text}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

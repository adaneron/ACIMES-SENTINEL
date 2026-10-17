import { useState } from 'react';
import { 
  RefreshCw, 
  Smartphone, 
  Battery, 
  BatteryCharging, 
  Camera, 
  Download, 
  MapPin, 
  ExternalLink, 
  ShieldCheck, 
  Check,
  Sliders,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  Volume2,
  VolumeX
} from 'lucide-react';

export default function DevicesTab({
  devices = [],
  token,
  onRefreshDevices,
  onInspectDeviceSnapshot
}) {
  const pendingNodes = devices.filter((d) => d.isAuthorized === false);
  const authorizedNodes = devices.filter((d) => d.isAuthorized !== false);

  const [thresholdDrafts, setThresholdDrafts] = useState({});
  const [savingThresholdId, setSavingThresholdId] = useState(null);
  const [thresholdSuccessMap, setThresholdSuccessMap] = useState({});
  const [thresholdErrorMap, setThresholdErrorMap] = useState({});

  const [intervalDrafts, setIntervalDrafts] = useState({});
  const [savingIntervalId, setSavingIntervalId] = useState(null);
  const [intervalSuccessMap, setIntervalSuccessMap] = useState({});
  const [intervalErrorMap, setIntervalErrorMap] = useState({});

  const [requestingPhotoId, setRequestingPhotoId] = useState(null);
  const [photoRequestSuccessMap, setPhotoRequestSuccessMap] = useState({});
  const [photoRequestErrorMap, setPhotoRequestErrorMap] = useState({});

  const [togglingMuteId, setTogglingMuteId] = useState(null);

  const handleToggleMute = async (deviceId, currentMuted) => {
    if (!token) return;
    setTogglingMuteId(deviceId);
    try {
      const res = await fetch(`/api/devices/${deviceId}/mute`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isMuted: !currentMuted }),
      });
      const data = await res.json();
      if (data.success) {
        onRefreshDevices();
      } else {
        alert(data.error || 'Error al cambiar estado de silencio');
      }
    } catch (err) {
      alert(`Fallo de red: ${err.message}`);
    } finally {
      setTogglingMuteId(null);
    }
  };

  const handleThresholdChange = (deviceId, value) => {
    setThresholdDrafts((prev) => ({
      ...prev,
      [deviceId]: value,
    }));
  };

  const handleSaveThreshold = async (deviceId, currentVal) => {
    if (!token) return;
    const valueToSave = thresholdDrafts[deviceId] !== undefined ? thresholdDrafts[deviceId] : currentVal;
    if (valueToSave < 1.0 || valueToSave > 50.0) {
      alert('El umbral debe situarse entre 1.0 y 50.0 m/s²');
      return;
    }

    setSavingThresholdId(deviceId);
    setThresholdErrorMap((prev) => ({ ...prev, [deviceId]: null }));

    try {
      const res = await fetch(`/api/devices/${deviceId}/threshold`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ movementThreshold: Number(valueToSave) }),
      });
      const data = await res.json();
      if (data.success) {
        setThresholdSuccessMap((prev) => ({ ...prev, [deviceId]: true }));
        setTimeout(() => {
          setThresholdSuccessMap((prev) => ({ ...prev, [deviceId]: false }));
        }, 3000);
        onRefreshDevices();
      } else {
        setThresholdErrorMap((prev) => ({ ...prev, [deviceId]: data.error || 'Error al guardar calibración' }));
      }
    } catch (err) {
      setThresholdErrorMap((prev) => ({ ...prev, [deviceId]: err.message }));
    } finally {
      setSavingThresholdId(null);
    }
  };

  const handleIntervalChange = (deviceId, value) => {
    setIntervalDrafts((prev) => ({
      ...prev,
      [deviceId]: value,
    }));
  };

  const handleSaveInterval = async (deviceId, currentVal) => {
    if (!token) return;
    const valueToSave = intervalDrafts[deviceId] !== undefined ? intervalDrafts[deviceId] : currentVal;
    const minutes = parseInt(valueToSave, 10);
    if (isNaN(minutes) || minutes < 1 || minutes > 1440) {
      alert('El intervalo debe situarse entre 1 y 1440 minutos');
      return;
    }

    setSavingIntervalId(deviceId);
    setIntervalErrorMap((prev) => ({ ...prev, [deviceId]: null }));

    try {
      const res = await fetch(`/api/devices/${deviceId}/photo-interval`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ intervalMinutes: minutes }),
      });
      const data = await res.json();
      if (data.success) {
        setIntervalSuccessMap((prev) => ({ ...prev, [deviceId]: true }));
        setTimeout(() => {
          setIntervalSuccessMap((prev) => ({ ...prev, [deviceId]: false }));
        }, 3000);
        onRefreshDevices();
      } else {
        setIntervalErrorMap((prev) => ({ ...prev, [deviceId]: data.error || 'Error al guardar intervalo' }));
      }
    } catch (err) {
      setIntervalErrorMap((prev) => ({ ...prev, [deviceId]: err.message }));
    } finally {
      setSavingIntervalId(null);
    }
  };

  const handleRequestManualPhoto = async (deviceId) => {
    if (!token) return;
    setRequestingPhotoId(deviceId);
    setPhotoRequestErrorMap((prev) => ({ ...prev, [deviceId]: null }));

    try {
      const res = await fetch(`/api/devices/${deviceId}/capture-photo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setPhotoRequestSuccessMap((prev) => ({ ...prev, [deviceId]: true }));
        setTimeout(() => {
          setPhotoRequestSuccessMap((prev) => ({ ...prev, [deviceId]: false }));
        }, 4000);
      } else {
        setPhotoRequestErrorMap((prev) => ({ ...prev, [deviceId]: data.error || 'Error al solicitar foto' }));
      }
    } catch (err) {
      setPhotoRequestErrorMap((prev) => ({ ...prev, [deviceId]: err.message }));
    } finally {
      setRequestingPhotoId(null);
    }
  };

  const handleAuthorizeNode = async (deviceId, _deviceName) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/devices/${deviceId}/authorize`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        onRefreshDevices();
      } else {
        alert(data.error || 'Error al autorizar nodo.');
      }
    } catch (e) {
      alert(e.message);
    }
  };

  const handleRejectNode = async (deviceId, deviceName) => {
    if (!token) return;
    if (!confirm(`¿Estás seguro de rechazar el nodo "${deviceName}"?`)) return;

    try {
      const res = await fetch(`/api/devices/${deviceId}/reject`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        onRefreshDevices();
      } else {
        alert(data.error || 'Error al rechazar nodo.');
      }
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-400" />
            <span>Nodos Móviles Centinela (Red de Sensores)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Monitoreo en tiempo real de telemetría vital, nivel de batería, temperatura y capturas de cámara.
          </p>
        </div>
        <button
          onClick={onRefreshDevices}
          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Sección de Nodos Pendientes de Autorización */}
      {pendingNodes.length > 0 && (
        <div className="bg-amber-950/25 border border-amber-500/40 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-400">
              <ShieldCheck className="w-5 h-5 animate-pulse" />
              <div>
                <h3 className="text-sm font-bold text-white">Nodos Pendientes de Autorización</h3>
                <p className="text-xs text-amber-200/80">Dispositivos móviles que han solicitado conectarse como nodos de la red.</p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {pendingNodes.length} pendiente(s)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
            {pendingNodes.map((dev) => (
              <div key={dev.id} className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-4 shadow-lg space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">{dev.name}</h4>
                    <p className="text-[10px] text-slate-400 font-mono">{dev.model || 'Android'} &bull; ID: {dev.deviceIdentifier}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                    Pendiente
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 font-mono">
                  Solicitado: {dev.authRequestedAt ? new Date(dev.authRequestedAt).toLocaleTimeString() : 'Recientemente'}
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleRejectNode(dev.id, dev.name)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-red-950/40 text-slate-400 hover:text-red-300 border border-slate-700 text-xs font-semibold transition cursor-pointer"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => handleAuthorizeNode(dev.id, dev.name)}
                    className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Aprobar y Autorizar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cuadrícula de Dispositivos Autorizados */}
      <div>
        <h3 className="text-xs font-mono uppercase text-slate-400 mb-4 tracking-wider font-semibold">
          Nodos Activos & Autorizados en la Red
        </h3>

        {authorizedNodes.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500 text-xs">
            No hay nodos autorizados en este momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {authorizedNodes.map((dev) => {
              const isOnline = dev.isOnline;
              const battery = dev.telemetrySummary?.batteryLevel ?? 0;
              const isCharging = dev.telemetrySummary?.isCharging;
              const batteryTemp = dev.telemetrySummary?.batteryTemp ?? '--';
              const cpuTemp = dev.telemetrySummary?.cpuTemp ?? '--';

              const lat = dev.location?.latitude || dev.lastLatitude;
              const lng = dev.location?.longitude || dev.lastLongitude;
              const hasCoords = lat != null && lng != null;
              const gmapsUrl = hasCoords ? `https://www.google.com/maps?q=${lat},${lng}` : null;

              const ev = dev.latestEvidence;
              let photoUrl = ev?.filePath || dev.latestPhotoUrl;
              if (photoUrl && typeof photoUrl === 'string' && !photoUrl.startsWith('/') && !photoUrl.startsWith('http')) {
                photoUrl = '/' + photoUrl;
              }
              const photoFilename = ev?.originalFilename || `foto_${dev.deviceIdentifier}.jpg`;
              const photoTime = ev?.capturedAt ? new Date(ev.capturedAt).toLocaleString() : 'Reciente';

              const serverThreshold = Number(dev.movementThreshold ?? 14.5);
              const displayThreshold = thresholdDrafts[dev.id] !== undefined ? thresholdDrafts[dev.id] : serverThreshold;
              const isDirty = Math.abs(displayThreshold - serverThreshold) > 0.01;
              const isSaving = savingThresholdId === dev.id;
              const isSuccess = Boolean(thresholdSuccessMap[dev.id]);
              const errorMsg = thresholdErrorMap[dev.id];

              const serverInterval = Number(dev.photoIntervalMinutes ?? 3);
              const displayInterval = intervalDrafts[dev.id] !== undefined ? intervalDrafts[dev.id] : serverInterval;
              const isIntervalDirty = Number(displayInterval) !== serverInterval;
              const isSavingInterval = savingIntervalId === dev.id;
              const isIntervalSuccess = Boolean(intervalSuccessMap[dev.id]);
              const intervalErrorMsg = intervalErrorMap[dev.id];

              const isRequestingPhoto = requestingPhotoId === dev.id;
              const isPhotoRequestSuccess = Boolean(photoRequestSuccessMap[dev.id]);
              const photoRequestErrorMsg = photoRequestErrorMap[dev.id];

              return (
                <div
                  key={dev.id}
                  className="bg-[#0b101b] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 hover:border-slate-700 transition flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    {/* Header de la tarjeta */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                          <Smartphone className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">{dev.name}</h3>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {dev.model || 'Android'} &bull; {dev.osVersion || 'OS'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleMute(dev.id, dev.isMuted)}
                            disabled={togglingMuteId === dev.id}
                            title={dev.isMuted ? "Click para reanudar alertas de este nodo" : "Click para silenciar alertas de este nodo"}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase font-mono border transition cursor-pointer shadow-sm ${
                              dev.isMuted
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700'
                            }`}
                          >
                            {dev.isMuted ? <VolumeX className="w-3 h-3 text-amber-400" /> : <Volume2 className="w-3 h-3 text-emerald-400" />}
                            <span>{togglingMuteId === dev.id ? '...' : (dev.isMuted ? 'Silenciado' : 'Activo')}</span>
                          </button>

                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase font-mono border ${
                              isOnline
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-red-500/10 text-red-400 border-red-500/30'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-ping' : 'bg-red-500'}`} />
                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Barra de Batería */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                          {isCharging ? <BatteryCharging className="w-4 h-4 text-amber-400" /> : <Battery className="w-4 h-4 text-slate-400" />}
                          <span>Batería</span>
                          {isCharging && <span className="text-[10px] text-amber-400 font-bold">(Cargando)</span>}
                        </span>
                        <span className="font-bold font-mono text-white text-xs">{battery}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            battery < 20 ? 'bg-red-500' : battery < 50 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${battery}%` }}
                        />
                      </div>
                    </div>

                    {/* Indicadores de Temperatura */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-500 text-[10px] block mb-0.5">Temp. Batería</span>
                        <span className="font-bold text-slate-200 text-sm">{batteryTemp} °C</span>
                      </div>
                      <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-500 text-[10px] block mb-0.5">Temp. CPU</span>
                        <span className="font-bold text-slate-200 text-sm">{cpuTemp} °C</span>
                      </div>
                    </div>

                    {/* Calibración de Umbral Sísmico (Acelerómetro) */}
                    <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-slate-200 font-semibold">
                          <Sliders className="w-3.5 h-3.5 text-amber-400" />
                          <span>Umbral Sísmico</span>
                        </div>
                        <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {displayThreshold.toFixed(1)} m/s²
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="2.0"
                            max="35.0"
                            step="0.5"
                            value={displayThreshold}
                            onChange={(e) => handleThresholdChange(dev.id, parseFloat(e.target.value))}
                            className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              type="number"
                              min="1.0"
                              max="50.0"
                              step="0.5"
                              value={displayThreshold}
                              onChange={(e) => handleThresholdChange(dev.id, parseFloat(e.target.value) || 14.5)}
                              className="w-16 px-1.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-center text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                            />
                            <span className="text-[10px] text-slate-500 font-mono">m/s²</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                          <span>Alta sens. (2.0)</span>
                          <span className="text-slate-400 font-sans">
                            {displayThreshold < 10
                              ? '🛡️ Muy sensible'
                              : displayThreshold <= 18
                              ? '⚙️ Normal / Recomendado'
                              : '🚛 Baja sens. (Filtro)'}
                          </span>
                          <span>Baja (35.0)</span>
                        </div>
                      </div>

                      <div className="pt-1 flex items-center justify-between border-t border-slate-800/80">
                        <div>
                          {isSuccess && (
                            <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>¡Calibrado!</span>
                            </span>
                          )}
                          {errorMsg && (
                            <span className="text-[10px] text-red-400 font-medium flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>{errorMsg}</span>
                            </span>
                          )}
                          {!isSuccess && !errorMsg && isDirty && (
                            <span className="text-[10px] text-amber-400/90 italic font-mono">
                              Modificado
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => handleSaveThreshold(dev.id, serverThreshold)}
                          disabled={isSaving || !isDirty}
                          className={`px-2.5 py-1 rounded text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-sm ${
                            isDirty
                              ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                              : 'bg-slate-800/60 text-slate-500 border border-slate-800 cursor-not-allowed'
                          }`}
                        >
                          <Save className="w-3 h-3" />
                          <span>{isSaving ? 'Guardando...' : 'Calibrar'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Configuración de Intervalo de Captura Periódica */}
                    <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-slate-200 font-semibold">
                          <Clock className="w-3.5 h-3.5 text-blue-400" />
                          <span>Frecuencia de Captura</span>
                        </div>
                        <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                          Cada {displayInterval} min
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="1"
                            max="60"
                            step="1"
                            value={displayInterval}
                            onChange={(e) => handleIntervalChange(dev.id, parseInt(e.target.value, 10))}
                            className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              type="number"
                              min="1"
                              max="1440"
                              value={displayInterval}
                              onChange={(e) => handleIntervalChange(dev.id, parseInt(e.target.value, 10) || 3)}
                              className="w-16 px-1.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-center text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                            />
                            <span className="text-[10px] text-slate-500 font-mono">min</span>
                          </div>
                        </div>

                        {/* Presets rápidos */}
                        <div className="flex items-center gap-1 pt-1 overflow-x-auto">
                          {[1, 2, 3, 5, 10, 15, 30].map((min) => (
                            <button
                              key={min}
                              type="button"
                              onClick={() => handleIntervalChange(dev.id, min)}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition cursor-pointer ${
                                Number(displayInterval) === min
                                  ? 'bg-blue-600 text-white font-bold'
                                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {min}m
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-1 flex items-center justify-between border-t border-slate-800/80">
                        <div>
                          {isIntervalSuccess && (
                            <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>¡Intervalo guardado!</span>
                            </span>
                          )}
                          {intervalErrorMsg && (
                            <span className="text-[10px] text-red-400 font-medium flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>{intervalErrorMsg}</span>
                            </span>
                          )}
                          {!isIntervalSuccess && !intervalErrorMsg && isIntervalDirty && (
                            <span className="text-[10px] text-blue-400/90 italic font-mono">
                              Modificado
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => handleSaveInterval(dev.id, serverInterval)}
                          disabled={isSavingInterval || !isIntervalDirty}
                          className={`px-2.5 py-1 rounded text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-sm ${
                            isIntervalDirty
                              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
                              : 'bg-slate-800/60 text-slate-500 border border-slate-800 cursor-not-allowed'
                          }`}
                        >
                          <Save className="w-3 h-3" />
                          <span>{isSavingInterval ? 'Guardando...' : 'Guardar'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Botón de Captura Manual Remota */}
                    <div className="pt-1">
                      <button
                        onClick={() => handleRequestManualPhoto(dev.id)}
                        disabled={isRequestingPhoto || !isOnline}
                        className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md ${
                          !isOnline
                            ? 'bg-slate-800/50 text-slate-500 border border-slate-800 cursor-not-allowed'
                            : isRequestingPhoto
                            ? 'bg-indigo-700/60 text-indigo-200 cursor-wait'
                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-indigo-600/20 cursor-pointer'
                        }`}
                      >
                        <Camera className="w-4 h-4" />
                        <span>{isRequestingPhoto ? 'Enviando orden...' : '📸 Capturar Foto Ahora'}</span>
                      </button>

                      {isPhotoRequestSuccess && (
                        <div className="mt-1.5 p-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>¡Orden de captura enviada al nodo!</span>
                        </div>
                      )}
                      {photoRequestErrorMsg && (
                        <div className="mt-1.5 p-1.5 rounded-lg bg-red-950/40 border border-red-500/30 text-[11px] text-red-300 flex items-center gap-1.5 font-medium">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span>{photoRequestErrorMsg}</span>
                        </div>
                      )}
                    </div>

                    {/* Botón de Silenciar / Reanudar Transmisión de Alertas */}
                    <div className="pt-1">
                      <button
                        onClick={() => handleToggleMute(dev.id, dev.isMuted)}
                        disabled={togglingMuteId === dev.id}
                        className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer border ${
                          dev.isMuted
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/50 shadow-emerald-900/30'
                            : 'bg-slate-900/90 hover:bg-slate-800 text-amber-300 hover:text-amber-200 border-amber-500/30'
                        }`}
                      >
                        {dev.isMuted ? (
                          <>
                            <Volume2 className="w-4 h-4 text-white" />
                            <span>{togglingMuteId === dev.id ? 'Reanudando...' : '▶️ Reanudar Alertas del Nodo (Activar)'}</span>
                          </>
                        ) : (
                          <>
                            <VolumeX className="w-4 h-4 text-amber-400" />
                            <span>{togglingMuteId === dev.id ? 'Silenciando...' : '🔇 Silenciar / Pausar Alertas del Nodo'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Sección de Última Foto Tomada */}
                    {photoUrl ? (
                      <div className="space-y-2 pt-3 border-t border-slate-800">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-300 flex items-center gap-1.5 text-[11px]">
                            <Camera className="w-3.5 h-3.5 text-blue-400" />
                            <span>Última Foto Tomada</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            {ev?.ocrStatus === 'pending' && (
                              <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 text-[10px] font-mono border border-cyan-500/30 animate-pulse">
                                OCR en curso
                              </span>
                            )}
                            {ev?.floodDetected && (
                              <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-mono border border-red-500/30 font-bold">
                                🌊 {ev.waterLevelCm ? `${ev.waterLevelCm} cm` : 'Inundación'}
                              </span>
                            )}
                            {ev?.ocrStatus === 'processed' && !ev?.floodDetected && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-mono border border-emerald-500/30">
                                Calzada normal
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 font-mono">{photoTime}</span>
                          </div>
                        </div>

                        <div className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
                          <img
                            src={photoUrl}
                            alt={`Última foto de ${dev.name}`}
                            className="w-full h-36 object-cover cursor-pointer group-hover:scale-105 transition duration-300"
                            onClick={() => onInspectDeviceSnapshot(dev)}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />
                          <button
                            onClick={() => onInspectDeviceSnapshot(dev)}
                            className="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-900 text-white text-[10px] font-semibold border border-slate-700 backdrop-blur-sm transition flex items-center gap-1 shadow cursor-pointer"
                          >
                            <span>Ampliar</span>
                          </button>
                        </div>

                        <a
                          href={photoUrl}
                          download={photoFilename}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-bold transition shadow-sm cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Descargar Foto</span>
                        </a>
                      </div>
                    ) : (
                      <div className="pt-3 border-t border-slate-800">
                        <div className="w-full py-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 flex flex-col items-center justify-center text-slate-500 text-xs gap-1">
                          <Camera className="w-4 h-4 text-slate-600" />
                          <span>Sin fotos capturadas aún</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Coordenadas GPS y Última Conexión */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    {hasCoords ? (
                      <a
                        href={gmapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 font-bold"
                        title="Abrir ubicación en Google Maps"
                      >
                        <MapPin className="w-3.5 h-3.5 text-red-400" />
                        <span>{Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                      </a>
                    ) : (
                      <span className="text-slate-600">--</span>
                    )}
                    <span className="text-[10px] italic text-slate-500">
                      {dev.secondsSinceLastSeen !== null ? `Hace ${dev.secondsSinceLastSeen}s` : 'Sin datos'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

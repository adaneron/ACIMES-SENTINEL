import { useState } from 'react';
import { X, Download, MapPin, ExternalLink, Activity, Waves, Camera, RotateCw, MessageSquare } from 'lucide-react';

export default function EvidenceModal({ incident, report, deviceSnapshot, onClose }) {
  const [rotation, setRotation] = useState(0);
  const data = incident || report || deviceSnapshot;
  if (!data) return null;

  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const isQuake = data.incidentType === 'sismo' || Boolean(data.sensorSnapshot?.magnitude);
  const seismicMag = data.sensorSnapshot?.magnitude ? parseFloat(data.sensorSnapshot.magnitude) : null;
  const accelX = data.sensorSnapshot?.accelX ?? '--';
  const accelY = data.sensorSnapshot?.accelY ?? '--';
  const accelZ = data.sensorSnapshot?.accelZ ?? '--';
  const threshold = data.sensorSnapshot?.threshold ?? 14.5;

  const ev = data.evidence || data.latestEvidence || data.metadata;
  let photoUrl =
    data.evidenceUrl ||
    data.photoUrl ||
    data.filePath ||
    ev?.url ||
    ev?.filePath ||
    ev?.photoUrl ||
    ev?.imagePath ||
    data.sensorSnapshot?.imagePath ||
    (typeof ev === 'string' ? ev : null);

  if (photoUrl && typeof photoUrl === 'string' && !photoUrl.startsWith('http') && !photoUrl.startsWith('/')) {
    photoUrl = '/' + photoUrl;
  }

  const photoFilename = ev?.filename || ev?.originalFilename || data.originalFilename || 'evidencia_sentinel.jpg';

  const lat = data.location?.latitude ?? data.latitude;
  const lng = data.location?.longitude ?? data.longitude;
  const hasCoords = lat != null && lng != null;
  const gmapsUrl = hasCoords ? `https://www.google.com/maps?q=${lat},${lng}` : null;

  const handleShareWhatsApp = () => {
    const title = data.title || 'Alerta SENTINEL';
    const sev = String(data.severity || 'ALTA').toUpperCase();
    const time = data.hora ? `${data.hora} hrs (${data.fecha || 'Hoy'})` : new Date().toLocaleTimeString('es-VE');
    const coordsStr = hasCoords ? `\n📍 Coordenadas: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}\n🗺️ Mapa: ${gmapsUrl}` : '';
    const magStr = seismicMag ? `\n⚡ Aceleración Sísmica: ${seismicMag} m/s²` : '';
    const floodStr = ev?.waterLevelCm ? `\n🌊 Nivel de Agua: ${ev.waterLevelCm} cm` : '';
    const msg = `🚨 *SENTINEL | REPORTE TÁCTICO DE EMERGENCIA*\n*Incidencia:* ${title}\n*Severidad:* ${sev}\n*Hora:* ${time}${magStr}${floodStr}${coordsStr}\n\n_Despachado desde Centro de Operaciones SENTINEL_`;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0b101b] border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[92vh] flex flex-col my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          title="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Encabezado */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-800">
          <div className={`p-2.5 rounded-xl ${isQuake ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'}`}>
            {isQuake ? <Activity className="w-6 h-6 animate-pulse" /> : <Waves className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] tracking-wider uppercase font-bold text-slate-400">
                SENTINEL TELEMETRÍA DETALLADA
              </span>
              {data.severity && (
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-600/20 text-red-400 border border-red-500/30">
                  {data.severity}
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-white mt-0.5">
              {data.title || `Nodo: ${data.name || 'Dispositivo'}`}
            </h3>
            <p className="text-xs text-slate-400">
              {data.hora ? `Detectado a las ${data.hora} hrs &bull; ${data.fecha || ''}` : 'Lectura de telemetría en tiempo real'}
            </p>
          </div>
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 tactical-scrollbar">

          {/* Descripción */}
          {data.description && (
            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 text-xs text-slate-300">
              <span className="text-[11px] font-bold text-slate-400 block mb-1">Detalle del Evento:</span>
              <p>{data.description}</p>
            </div>
          )}

          {/* Bloque de Telemetría Sísmica */}
          {isQuake && (
            <div className="bg-slate-900/60 rounded-xl p-4 border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider font-mono">
                  Vector de Aceleración y Sacudida
                </span>
                <span className="text-xs font-mono font-bold text-slate-400">
                  Umbral Alerta: {threshold} m/s²
                </span>
              </div>

              {/* Magnitud Destacada */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <div>
                  <span className="text-[11px] font-mono text-amber-300 font-bold block">
                    MAGNITUD RESULTANTE DEL SISMO:
                  </span>
                  <span className="text-xs text-slate-300">
                    Aceleración neta capturada por sensores del dispositivo
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black font-mono text-amber-400">
                    {seismicMag ? seismicMag.toFixed(2) : '--'}
                  </span>
                  <span className="text-xs font-mono text-amber-500/80 block">m/s²</span>
                </div>
              </div>

              {/* Desglose Ejes X, Y, Z */}
              <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Eje X</span>
                  <span className="font-bold text-slate-200">{accelX} m/s²</span>
                </div>
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Eje Y</span>
                  <span className="font-bold text-slate-200">{accelY} m/s²</span>
                </div>
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Eje Z</span>
                  <span className="font-bold text-slate-200">{accelZ} m/s²</span>
                </div>
              </div>
            </div>
          )}

          {/* Bloque de Foto Capturada con Botón de Descarga */}
          {photoUrl && (
            <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
              <div className="flex items-center justify-center min-h-[220px] max-h-[380px] bg-[#05080f] p-3 overflow-hidden">
                <img
                  src={photoUrl}
                  alt="Evidencia fotográfica"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    transition: 'transform 0.25s ease-in-out'
                  }}
                  className="max-h-[360px] w-auto object-contain rounded-lg shadow-lg"
                  onError={(e) => {
                    console.warn('Error al cargar imagen en modal:', photoUrl);
                    e.target.style.display = 'none';
                  }}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-900 border-t border-slate-800 gap-2 flex-wrap">
                <div className="flex items-center gap-2 truncate mr-2">
                  <Camera className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-xs text-slate-300 font-mono truncate">{photoFilename}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRotate}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold transition border border-slate-700 cursor-pointer shadow-sm"
                    title="Rotar imagen 90 grados"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Rotar 90°</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono transition shadow-md shadow-emerald-600/30 whitespace-nowrap cursor-pointer"
                    title="Compartir reporte con foto y coordenadas por WhatsApp"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>
                  <a
                    href={photoUrl}
                    download={photoFilename}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md shadow-blue-600/30 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar Foto</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Bloque de Coordenadas GPS con Enlace a Google Maps */}
          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-800 flex items-center justify-between text-xs font-mono">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5 font-sans">
              <MapPin className="w-4 h-4 text-red-400" />
              <span>Coordenadas GPS:</span>
            </span>
            {hasCoords ? (
              <a
                href={gmapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1.5 font-bold"
                title="Abrir ubicación en Google Maps"
              >
                <span>{Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <span className="text-slate-500">Coordenadas no disponibles</span>
            )}
          </div>

          {/* Bloque de Detección OCR de Inundación */}
          {ev && (ev.floodDetected || ev.waterLevelCm || ev.ocrRawText) && (
            <div className="bg-slate-900/60 rounded-xl p-4 border border-cyan-500/30 text-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300">Análisis OCR de Inundación:</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${ev.floodDetected ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800 text-slate-300'}`}>
                  {ev.floodDetected ? '🌊 Inundación Detectada' : 'Nivel Normal'}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-400">Nivel de Agua Detectado:</span>
                <span className="text-white font-bold">{ev.waterLevelCm ? `${ev.waterLevelCm} cm` : 'No medible'}</span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-400">Confianza Algorítmica:</span>
                <span className="text-emerald-400 font-bold">{ev.floodConfidence ? `${(ev.floodConfidence * 100).toFixed(0)}%` : '--'}</span>
              </div>
              {ev.ocrRawText && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-slate-400 block mb-1">Texto Reconocido:</span>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[11px] text-slate-300">
                    {ev.ocrRawText}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

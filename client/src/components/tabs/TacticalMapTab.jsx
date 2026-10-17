import { useState, useCallback } from 'react';
import { ShieldAlert, Activity, Waves, Radio, MapPin, Eye, CheckCircle } from 'lucide-react';
import TacticalMap from '../TacticalMap';

export default function TacticalMapTab({
  incidents = [],
  devices = [],
  stats = {},
  liveAlerts = [],
  onSelectIncident,
  onSelectDevice
}) {
  const [mapCenter, setMapCenter] = useState(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);

  const activeIncidents = incidents.filter((i) => i.status === 'activa');
  const criticalCount = activeIncidents.filter((i) => i.severity === 'critica' || i.severity === 'alta').length;
  const onlineDevicesCount = devices.filter((d) => d.isOnline).length;

  // Combinar alertas en vivo con reportes anteriores en orden del más nuevo al más viejo
  const allFeedReports = (() => {
    const map = new Map();
    (liveAlerts || []).forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
    (incidents || []).forEach((item) => {
      if (item?.id && !map.has(item.id)) map.set(item.id, item);
    });
    return Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.detectedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.detectedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  })();

  const handleCenterAlert = useCallback((alert, openModal = false) => {
    const lat = alert.location?.latitude ?? alert.latitude;
    const lng = alert.location?.longitude ?? alert.longitude;
    if (lat != null && lng != null) {
      setMapCenter({ lat, lng, alertId: alert.id });
      setSelectedIncidentId(alert.id);
    }
    if (openModal && onSelectIncident) {
      onSelectIncident(alert);
    }
  }, [onSelectIncident]);

  const handleSelectIncidentFromMap = useCallback((inc) => {
    handleCenterAlert(inc, false);
  }, [handleCenterAlert]);

  return (
    <div className="space-y-6">

      {/* DEFCON Status Bar & KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* KPI 1: Amenazas Críticas */}
        <div className={`p-4 rounded-2xl border ${criticalCount > 0 ? 'bg-red-950/40 border-red-500/50 shadow-lg shadow-red-900/20' : 'bg-slate-900/60 border-slate-800'} flex items-center justify-between`}>
          <div>
            <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">
              Amenazas Críticas
            </span>
            <div className={`text-2xl sm:text-3xl font-black font-mono ${criticalCount > 0 ? 'text-red-400 animate-pulse' : 'text-slate-200'}`}>
              {criticalCount}
            </div>
            <span className="text-[10px] text-slate-400">
              {criticalCount > 0 ? 'Acción inmediata requerida' : 'Sin alertas rojas'}
            </span>
          </div>
          <div className={`p-3 rounded-xl ${criticalCount > 0 ? 'bg-red-600/20 text-red-400' : 'bg-slate-800 text-slate-500'}`}>
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 2: Sismos Detectados */}
        <div className="p-4 rounded-2xl border bg-slate-900/60 border-slate-800 flex items-center justify-between">
          <div>
            <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">
              Eventos Sísmicos
            </span>
            <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400">
              {stats?.byType?.sismo ?? incidents.filter((i) => i.incidentType === 'sismo').length}
            </div>
            <span className="text-[10px] text-slate-400">Umbral: &gt;14.50 m/s²</span>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 3: Inundaciones OCR */}
        <div className="p-4 rounded-2xl border bg-slate-900/60 border-slate-800 flex items-center justify-between">
          <div>
            <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">
              Alertas Inundación
            </span>
            <div className="text-2xl sm:text-3xl font-black font-mono text-cyan-400">
              {stats?.byType?.inundacion ?? incidents.filter((i) => i.incidentType === 'inundacion').length}
            </div>
            <span className="text-[10px] text-slate-400">Visión computacional</span>
          </div>
          <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400">
            <Waves className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 4: Nodos Móviles Online */}
        <div className="p-4 rounded-2xl border bg-slate-900/60 border-slate-800 flex items-center justify-between">
          <div>
            <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">
              Nodos Centinela
            </span>
            <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
              {onlineDevicesCount}
              <span className="text-xs text-slate-500 font-normal"> / {devices.length}</span>
            </div>
            <span className="text-[10px] text-emerald-400/80">Transmitiendo en vivo</span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Radio className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Grid: Mapa Táctico (2 columnas) + Feed Transmisión en Vivo (1 columna) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Mapa Táctico (2 columnas) */}
        <div className="lg:col-span-2 space-y-3">
          <TacticalMap
            incidents={incidents}
            devices={devices}
            centerCoords={mapCenter}
            selectedIncidentId={selectedIncidentId}
            onSelectIncident={handleSelectIncidentFromMap}
            onSelectDevice={onSelectDevice}
          />
        </div>

        {/* Feed de Transmisión en Vivo (Incluye alertas en vivo y reportes anteriores ordenados del más nuevo al más viejo) */}
        <div className="bg-[#0b101b] border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col h-[540px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                Transmisión en Vivo
              </h3>
            </div>
            <span className="text-[9px] font-mono font-bold bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
              {allFeedReports.length} REPORTES
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 tactical-scrollbar">
            {allFeedReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8 text-slate-500 text-xs font-mono">
                <CheckCircle className="w-8 h-8 text-slate-600 mb-2" />
                <span>Sin incidentes críticos registrados.</span>
                <span className="text-[10px] text-slate-600 mt-1">Canal de telemetría a la espera de señales</span>
              </div>
            ) : (
              allFeedReports.map((alert, idx) => {
                const isQuake = alert.incidentType === 'sismo';
                const isFlood = alert.incidentType === 'inundacion';
                const mag = alert.sensorSnapshot?.magnitude ? parseFloat(alert.sensorSnapshot.magnitude).toFixed(2) : null;
                const isSelected = selectedIncidentId === alert.id;

                return (
                  <div
                    key={alert.id || idx}
                    onClick={() => handleCenterAlert(alert, false)}
                    className={`p-3 rounded-xl border transition cursor-pointer space-y-1.5 group ${
                      isSelected
                        ? 'bg-slate-800/90 border-cyan-500 shadow-md shadow-cyan-950'
                        : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded ${isQuake ? 'bg-red-500/20 text-red-400 border border-red-500/30' : isFlood ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-amber-500/20 text-amber-400'}`}>
                        {alert.incidentType || 'ALERTA'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {alert.hora || (alert.detectedAt ? new Date(alert.detectedAt).toLocaleTimeString() : alert.createdAt ? new Date(alert.createdAt).toLocaleTimeString() : 'Reciente')}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-white group-hover:text-cyan-400 transition line-clamp-1">
                      {alert.title}
                    </h4>

                    {mag && (
                      <div className="text-[11px] font-mono font-bold text-amber-300">
                        ⚡ Magnitud: {mag} m/s²
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1 font-mono">
                        <MapPin className="w-3 h-3 text-red-400" />
                        {alert.location?.latitude ? `${Number(alert.location.latitude).toFixed(2)}, ${Number(alert.location.longitude).toFixed(2)}` : 'Terreno'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCenterAlert(alert, true);
                        }}
                        className="text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center gap-1 hover:underline text-[10px]"
                        title="Ver ficha de evidencia completa"
                      >
                        <span>Detalle</span>
                        <Eye className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

    </div>
  );
}

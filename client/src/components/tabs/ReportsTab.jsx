import { useState, useEffect, useCallback } from 'react';
import { Filter, ExternalLink, MapPin, Eye, FileSpreadsheet } from 'lucide-react';

export default function ReportsTab({
  currentUser,
  token,
  devices = [],
  onInspectReport,
  onOpenResolve,
  socket,
}) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filtros
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [deviceId, setDeviceId] = useState('');

  const fetchReports = useCallback(async (targetPage = 1) => {
    setLoading(true);
    setPage(targetPage);

    const params = new URLSearchParams({
      page: String(targetPage),
      limit: '15',
    });
    if (type) params.set('type', type);
    if (severity) params.set('severity', severity);
    if (status) params.set('status', status);
    if (deviceId) params.set('deviceId', deviceId);

    try {
      const res = await fetch(`/api/reports?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setReports(data.reports || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
      }
    } catch (err) {
      console.error('Error al cargar informes de Sentinel:', err);
    } finally {
      setLoading(false);
    }
  }, [type, severity, status, deviceId]);

  useEffect(() => {
    fetchReports(1);
  }, [fetchReports]);

  // Actualización en tiempo real vía WebSockets en la pestaña de Historial & Reportes
  useEffect(() => {
    if (!socket) return;

    const handleRealtimeRefresh = () => {
      fetchReports(page);
    };

    socket.on('incident:new', handleRealtimeRefresh);
    socket.on('incident:updated', handleRealtimeRefresh);
    socket.on('incident:resolved', handleRealtimeRefresh);
    socket.on('device:evidence_new', handleRealtimeRefresh);
    socket.on('device:evidence_updated', handleRealtimeRefresh);

    return () => {
      socket.off('incident:new', handleRealtimeRefresh);
      socket.off('incident:updated', handleRealtimeRefresh);
      socket.off('incident:resolved', handleRealtimeRefresh);
      socket.off('device:evidence_new', handleRealtimeRefresh);
      socket.off('device:evidence_updated', handleRealtimeRefresh);
    };
  }, [socket, page, fetchReports]);

  const handleExportCSV = () => {
    if (!token) {
      alert('Se requiere iniciar sesión como operador/administrador para exportar informes.');
      return;
    }
    window.location.href = `/api/reports/export/csv?token=${encodeURIComponent(token)}`;
  };

  return (
    <div className="space-y-6">

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-[#0b101b] border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Filtro por Tipo */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Tipo de Incidencia
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg text-xs text-white px-3 py-1.5 focus:outline-none focus:border-blue-500"
            >
              <option value="">Todos los tipos</option>
              <option value="sismo">Sismo (Acelerómetro)</option>
              <option value="inundacion">Inundación (Cámara / OCR)</option>
              <option value="bateria_critica">Batería Crítica</option>
              <option value="movimiento_brusco">Movimiento Brusco</option>
              <option value="temperatura_extrema">Temperatura Extrema</option>
              <option value="manual">Manual</option>
            </select>
          </div>

          {/* Filtro por Severidad */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Nivel de Severidad
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg text-xs text-white px-3 py-1.5 focus:outline-none focus:border-blue-500"
            >
              <option value="">Todas las severidades</option>
              <option value="critica">Crítica</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>

          {/* Filtro por Estado */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Estado Operativo
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg text-xs text-white px-3 py-1.5 focus:outline-none focus:border-blue-500"
            >
              <option value="">Todos los estados</option>
              <option value="activa">Activa</option>
              <option value="en_proceso">En Proceso</option>
              <option value="resuelta">Resuelta</option>
              <option value="falsa_alarma">Falsa Alarma</option>
            </select>
          </div>

          {/* Filtro por Dispositivo Nodo */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Dispositivo Nodo
            </label>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg text-xs text-white px-3 py-1.5 focus:outline-none focus:border-blue-500"
            >
              <option value="">Todos los dispositivos</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.deviceIdentifier})
                </option>
              ))}
            </select>
          </div>

          {/* Botón Aplicar Filtros */}
          <button
            onClick={() => fetchReports(1)}
            className="mt-4 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-600/20"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filtrar</span>
          </button>
        </div>

        {/* Botón Exportar CSV (Solo visible para Operadores/Admins) */}
        {currentUser && currentUser.role === 'admin' && (
          <div className="mt-4 sm:mt-0">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar CSV</span>
            </button>
          </div>
        )}
      </div>

      {/* Tabla de Informes de Incidencias */}
      <div className="bg-[#0b101b] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-400 font-mono text-[10px] uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Severidad</th>
                <th className="py-3 px-4">Incidencia & Magnitud</th>
                <th className="py-3 px-4">Hora & Fecha</th>
                <th className="py-3 px-4">Coordenadas (GPS)</th>
                <th className="py-3 px-4">Evidencia / OCR</th>
                <th className="py-3 px-4">Dispositivo</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500 font-mono">
                    Cargando informes de incidencias...
                  </td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    No se encontraron incidencias con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                reports.map((rep) => {
                  const isQuake = rep.incidentType === 'sismo' || Boolean(rep.sensorSnapshot?.magnitude);
                  const seismicMag = rep.sensorSnapshot?.magnitude ? parseFloat(rep.sensorSnapshot.magnitude) : null;

                  const lat = rep.location?.latitude;
                  const lng = rep.location?.longitude;
                  const hasCoords = lat != null && lng != null;
                  const gmapsUrl = hasCoords ? `https://www.google.com/maps?q=${lat},${lng}` : '#';

                  const severityBadge = {
                    critica: 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse',
                    alta: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
                    media: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                    baja: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
                  }[rep.severity] || 'bg-slate-800 text-slate-300 border-slate-700';

                  const statusBadge = {
                    activa: 'bg-red-500/20 text-red-400',
                    en_proceso: 'bg-amber-500/20 text-amber-300',
                    resuelta: 'bg-emerald-500/20 text-emerald-300',
                    falsa_alarma: 'bg-slate-800 text-slate-400',
                  }[rep.status] || 'bg-slate-800 text-slate-400';

                  const rawTime = rep.detectedAt || rep.createdAt || rep.horaIso;
                  const dateObj = rawTime ? new Date(rawTime) : null;
                  const displayHora = dateObj && !isNaN(dateObj.getTime())
                    ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
                    : (rep.hora || '--:--');
                  const displayFecha = dateObj && !isNaN(dateObj.getTime())
                    ? dateObj.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' })
                    : (rep.fecha || '--/--');

                  return (
                    <tr key={rep.id} className="hover:bg-slate-900/60 transition">
                      {/* Severidad */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${severityBadge}`}>
                          {rep.severity}
                        </span>
                      </td>

                      {/* Tipo y Título */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-bold text-white text-xs">{rep.title}</div>
                        <div className="text-[11px] text-slate-400 line-clamp-1">{rep.description}</div>
                        {isQuake && seismicMag !== null && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                              ⚡ Magnitud del Sismo: {seismicMag.toFixed(2)} m/s²
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Hora y Fecha */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono">
                        <div className="text-slate-100 font-bold text-xs">{displayHora}</div>
                        <div className="text-[10px] text-cyan-400/80">{displayFecha}</div>
                      </td>

                      {/* Coordenadas GPS */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono">
                        {hasCoords ? (
                          <a
                            href={gmapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 font-bold text-[11px]"
                            title="Abrir coordenadas en Google Maps"
                          >
                            <MapPin className="w-3.5 h-3.5 text-red-400" />
                            <span>{Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                          </a>
                        ) : (
                          <span className="text-slate-600 text-[11px]">--</span>
                        )}
                      </td>

                      {/* Evidencia Fotográfica / OCR */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {rep.evidence && rep.evidence.url ? (
                          <button
                            onClick={() => onInspectReport(rep)}
                            className="flex items-center gap-2 group text-left hover:text-blue-400 transition cursor-pointer"
                          >
                            <img
                              src={rep.evidence.url}
                              alt="Evidencia"
                              className="w-9 h-9 rounded-lg object-cover border border-slate-700 group-hover:border-blue-500 shadow-sm"
                            />
                            <div>
                              <span className="block text-[11px] font-semibold text-slate-200 group-hover:text-blue-400">
                                Ver Detalle
                              </span>
                              {rep.evidence.floodDetected ? (
                                <span className="text-[9px] text-cyan-400 font-bold">🌊 Inundación</span>
                              ) : (
                                <span className="text-[9px] text-slate-400">Cámara</span>
                              )}
                            </div>
                          </button>
                        ) : isQuake ? (
                          <button
                            onClick={() => onInspectReport(rep)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Ver Sismo</span>
                          </button>
                        ) : (
                          <span className="text-slate-600 italic text-[11px]">Sin archivo</span>
                        )}
                      </td>

                      {/* Dispositivo */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-slate-200 font-semibold">{rep.device?.name || 'Sistema'}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{rep.device?.model || ''}</div>
                      </td>

                      {/* Estado */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusBadge}`}>
                          {rep.status?.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Acción */}
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        {currentUser && currentUser.role === 'admin' ? (
                          rep.status === 'resuelta' || rep.status === 'falsa_alarma' ? (
                            <button
                              onClick={() => onOpenResolve(rep)}
                              className="px-2.5 py-1 rounded bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/40 text-[11px] font-bold transition cursor-pointer shadow-sm"
                              title="Apelar la resolución y reactivar esta alerta"
                            >
                              Apelar / Reabrir
                            </button>
                          ) : (
                            <button
                              onClick={() => onOpenResolve(rep)}
                              className="px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-[11px] font-bold transition cursor-pointer shadow-sm"
                            >
                              Resolver
                            </button>
                          )
                        ) : (
                          <span className="text-slate-500 text-[11px]">
                            {rep.status === 'resuelta' ? 'Cerrada' : 'Consulta'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="bg-slate-900 px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>Mostrando página {page} de {totalPages} ({totalCount} informes totales)</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => fetchReports(page - 1)}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white transition cursor-pointer"
            >
              Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => fetchReports(page + 1)}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white transition cursor-pointer"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

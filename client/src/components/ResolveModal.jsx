import { useState } from 'react';
import { X, CheckCircle } from 'lucide-react';

export default function ResolveModal({ incident, token, onClose, onResolved }) {
  const isCurrentlyClosed = incident?.status === 'resuelta' || incident?.status === 'falsa_alarma';
  const [status, setStatus] = useState(isCurrentlyClosed ? 'activa' : 'resuelta');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  if (!incident) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      alert('Debes estar autenticado como operador para gestionar incidencias.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${incident.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, resolutionNotes: notes }),
      });
      const data = await res.json();

      if (data.success) {
        onResolved(data.report);
        onClose();
      } else {
        alert(data.error || 'Error al actualizar estado.');
      }
    } catch (err) {
      alert(err.message || 'Error de comunicación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0b101b] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
          {isCurrentlyClosed ? (
            <span className="text-amber-400">⚖️ Apelar / Reabrir Incidencia</span>
          ) : (
            <span className="text-emerald-400">🛡️ Gestión Operativa de Incidencia</span>
          )}
        </h3>
        <p className="text-xs text-slate-400 mb-4 line-clamp-1 font-mono">
          {incident.title} (Estado actual: <span className="uppercase font-bold text-slate-200">{incident.status}</span>)
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nuevo Estado Operativo
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
            >
              <option value="activa">🟢 Reactivar Alerta / Incidencia Activa (Reabrir caso)</option>
              <option value="en_proceso">🟡 En Proceso / En Terreno / En Investigación</option>
              <option value="resuelta">🔵 Marcar como Resuelta / Situación Normalizada</option>
              <option value="falsa_alarma">⚪ Falsa Alarma / Lectura Descartada</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {isCurrentlyClosed ? 'Motivo de la Apelación / Justificación de Reapertura' : 'Observaciones y Notas de Operación'}
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isCurrentlyClosed
                ? "Ej: Se solicita reabrir la alerta debido a nuevos datos de sensores o inspección ocular que ameritan seguimiento."
                : "Ej: Zona inspeccionada por personal técnico. Sin daños en infraestructura crítica."
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-lg flex items-center justify-center gap-1.5 cursor-pointer ${
              isCurrentlyClosed
                ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            <span>{loading ? 'Guardando...' : (isCurrentlyClosed ? 'Confirmar Apelación y Reabrir Incidencia' : 'Confirmar Resolución')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

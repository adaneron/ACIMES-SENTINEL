import { useState } from 'react';
import { X, Award, Smartphone, Info, ArrowRight, ShieldCheck, MapPin } from 'lucide-react';

export default function WelcomeNoticeModal({ isOpen, onClose }) {
  const [dontShowAgainSession, setDontShowAgainSession] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (dontShowAgainSession) {
      try {
        sessionStorage.setItem('sentinel_dismiss_welcome_notice', 'true');
      } catch {
        // Ignorar si sessionStorage no está disponible
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#0b101b] border border-cyan-500/40 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl shadow-cyan-950/60 relative overflow-hidden">
        
        {/* Glow de fondo decorativo */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Botón Cerrar X */}
        <button
          type="button"
          onClick={handleConfirm}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors z-10"
          title="Cerrar aviso"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header con Logos e Insignias */}
        <div className="flex items-center gap-4 mb-5 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-cyan-500/40 p-1.5 flex items-center justify-center shadow-lg shadow-cyan-950/50 flex-shrink-0">
            <img
              src="/acimes_logo.png"
              alt="ACIMES Logo"
              className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(6,182,212,0.5)]"
            />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
                <Award className="w-3 h-3 text-cyan-400" />
                RALLY LATINOAMERICANO DE INNOVACIÓN 2026
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-wide font-mono flex items-center gap-1.5">
              <span>ACIMES</span>
              <span className="text-slate-500 font-normal">|</span>
              <span className="text-cyan-400">SENTINEL</span>
            </h2>
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-red-400 flex-shrink-0" />
              <span>IUPSM Sede Barcelona · Anzoátegui, Venezuela</span>
            </p>
          </div>
        </div>

        {/* Contenido del Mensaje */}
        <div className="space-y-3.5 text-xs sm:text-sm text-slate-300 leading-relaxed relative z-10">
          
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <p>
              Este sitio web fue hecho por los integrantes del grupo{' '}
              <strong className="text-cyan-400 font-bold">ACIMES</strong> como participación en el{' '}
              <strong className="text-white font-bold">Rally Latinoamericano de Innovación 2026</strong>, en representación de{' '}
              <strong className="text-white font-bold">IUPSM sede Barcelona, Anzoátegui, Venezuela</strong>.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-500/20 flex gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 h-fit flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-white font-mono text-xs uppercase tracking-wider mb-1">
                Propuesta Tecnológica
              </div>
              <p className="text-xs text-slate-300">
                La propuesta es un sistema de alerta temprana automatizada de incidentes (como sismos, inundaciones, entre otros...); utilizando teléfonos inteligentes como nodos sensores de bajo costo y fácil empleabilidad.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-950/20 border border-amber-500/20 flex gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 h-fit flex-shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-amber-300 font-mono text-xs uppercase tracking-wider mb-1">
                Aviso sobre Nodos Móviles
              </div>
              <p className="text-xs text-slate-300">
                Los nodos actualmente mostrados son teléfonos reales de los estudiantes; no están fijos en un sitio por eso las alertas frecuentes. Siéntase libre de explorar nuestra propuesta.
              </p>
            </div>
          </div>

        </div>

        {/* Footer y Acciones */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 relative z-10">
          <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgainSession}
              onChange={(e) => setDontShowAgainSession(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span>No volver a mostrar en esta sesión</span>
          </label>

          <button
            type="button"
            onClick={handleConfirm}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50 hover:shadow-cyan-900/60 transition-all cursor-pointer"
          >
            <span>Explorar Propuesta</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}

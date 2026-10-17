import { useState } from 'react';
import { X, Shield, UserPlus, ArrowLeft, CheckCircle2, AlertTriangle, Lock } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  // Campos de registro
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regStatus, setRegStatus] = useState(null); // { type: 'success' | 'error', message: '' }

  if (!isOpen) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();

      if (data.success && data.token) {
        localStorage.setItem('sentinel_jwt_token', data.token);
        onLoginSuccess(data.token, data.user);
        onClose();
      } else {
        setLoginError(data.error || 'Credenciales de acceso no válidas.');
      }
    } catch {
      setLoginError('Error de comunicación con el servidor central de Sentinel.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegStatus(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regName, email: regEmail, password: regPassword }),
      });
      const data = await res.json();

      if (data.success) {
        setRegStatus({
          type: 'success',
          message: data.message || 'Solicitud enviada. Un administrador activo autorizará tu cuenta.',
        });
        setRegName('');
        setRegEmail('');
        setRegPassword('');
        setTimeout(() => {
          setMode('login');
          setRegStatus(null);
        }, 3500);
      } else {
        setRegStatus({
          type: 'error',
          message: data.error || 'No se pudo procesar la solicitud.',
        });
      }
    } catch {
      setRegStatus({
        type: 'error',
        message: 'Error al contactar con el servicio de autenticación.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0b101b] border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header con insignia ACIMES | Sentinel */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-xl bg-slate-900 border border-cyan-500/30 p-1 flex items-center justify-center shadow-lg shadow-cyan-950/40">
            <img src="/acimes_logo.png" alt="ACIMES Logo" className="w-full h-full object-contain filter drop-shadow-[0_2px_6px_rgba(6,182,212,0.4)]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono font-bold text-cyan-400">ACIMES</span>
              <span className="text-xs text-slate-500">|</span>
              <span className="text-xs font-mono text-slate-300">SENTINEL</span>
            </div>
            <h3 className="text-base font-bold text-white tracking-wide">
              {mode === 'login' ? 'Acceso de Operador' : 'Solicitud de Cuenta'}
            </h3>
            <p className="text-[11px] text-slate-400">
              {mode === 'login' ? 'Red de Alerta Temprana y Gestión de Riesgos' : 'Registro de operadores de emergencia'}
            </p>
          </div>
        </div>

        {/* Modo 1: Iniciar Sesión */}
        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="operador@sentinel.org"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-mono"
              />
            </div>

            {loginError && (
              <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-950/40 text-red-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{loading ? 'Verificando...' : 'Ingresar al Centro de Control'}</span>
            </button>

            <div className="pt-3 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setLoginError('');
                }}
                className="text-xs text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>¿No tienes credenciales? Solicitar Cuenta Admin</span>
              </button>
            </div>
          </form>
        ) : (
          /* Modo 2: Solicitar Registro */
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nombre y Apellido
              </label>
              <input
                type="text"
                required
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="Ej: Marcelo Rojas"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Correo Electrónico Institucional
              </label>
              <input
                type="email"
                required
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="usuario@sentinel.org"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-mono"
              />
            </div>

            {regStatus && (
              <div
                className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                  regStatus.type === 'success'
                    ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                    : 'border-red-500/40 bg-red-950/40 text-red-300'
                }`}
              >
                {regStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <span>{regStatus.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>{loading ? 'Enviando Solicitud...' : 'Solicitar Autorización'}</span>
            </button>

            <div className="pt-3 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setRegStatus(null);
                }}
                className="text-xs text-slate-400 hover:text-white hover:underline inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>¿Ya tienes cuenta? Iniciar Sesión</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Radio,
  Map as MapIcon,
  FileSpreadsheet,
  Smartphone,
  Cpu,
  UserCheck,
  Volume2,
  VolumeX,
  Lock,
  LogOut,
  AlertOctagon,
  Clock,
  Wifi,
  WifiOff,
  X
} from 'lucide-react';

import TacticalMapTab from './components/tabs/TacticalMapTab';
import ReportsTab from './components/tabs/ReportsTab';
import DevicesTab from './components/tabs/DevicesTab';
import SimulatorTab from './components/tabs/SimulatorTab';
import AdminPanelTab from './components/tabs/AdminPanelTab';

import AuthModal from './components/AuthModal';
import EvidenceModal from './components/EvidenceModal';
import ResolveModal from './components/ResolveModal';

import { playAlarm, playFloodAlert, playBeep } from './utils/audio';

export default function App() {
  // Autenticación & Usuario
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('sentinel_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('sentinel_token') || '');

  // Pestaña Activa
  const [activeTab, setActiveTab] = useState('map');

  // Datos Globales
  const [incidents, setIncidents] = useState([]);
  const [devices, setDevices] = useState([]);
  const [stats, setStats] = useState({});
  const [liveAlerts, setLiveAlerts] = useState([]);

  // Modales
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [evidenceModalData, setEvidenceModalData] = useState(null);
  const [resolveModalData, setResolveModalData] = useState(null);

  // Estados Operativos
  const [socketConnected, setSocketConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const getTacticalTime = () => {
    const now = new Date();
    return `${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })} (HLV)`;
  };

  const [currentTime, setCurrentTime] = useState(getTacticalTime);
  const [criticalBanner, setCriticalBanner] = useState(null);
  const [toasts, setToasts] = useState([]);

  const socketRef = useRef(null);
  const [socketInstance, setSocketInstance] = useState(null);

  // Sistema de Toasts
  const showToast = useCallback((title, type = 'info', message = '') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, title, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const handleLogout = useCallback(() => {
    setToken('');
    setCurrentUser(null);
    localStorage.removeItem('sentinel_token');
    localStorage.removeItem('sentinel_user');
    setActiveTab((prev) => (prev === 'devices' || prev === 'simulator' || prev === 'admin' ? 'map' : prev));
    showToast('Sesión cerrada con éxito', 'info');
  }, [showToast]);

  // Reloj táctico sincronizado con la hora del sistema
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getTacticalTime());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Verificar sesión persistida
  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.user) {
            setCurrentUser(data.user);
            localStorage.setItem('sentinel_user', JSON.stringify(data.user));
          } else {
            handleLogout();
          }
        })
        .catch(() => {
          // Si hay fallo de red, mantener sesión local
        });
    }
  }, [token, handleLogout]);

  // Cargar lista de incidentes y estadísticas
  const fetchIncidentsAndStats = useCallback(async () => {
    try {
      const [resReports, resStats] = await Promise.all([
        fetch('/api/reports?limit=50'),
        fetch('/api/reports/statistics')
      ]);

      const dataReports = await resReports.json();
      const dataStats = await resStats.json();

      if (dataReports.success) {
        setIncidents(dataReports.reports || []);
      }
      if (dataStats.success) {
        setStats(dataStats.statistics || {});
      }
    } catch (e) {
      console.error('Error cargando reportes:', e);
    }
  }, []);

  // Cargar dispositivos (según rol)
  const fetchDevices = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/devices', { headers });
      const data = await res.json();
      if (data.success) {
        setDevices(data.devices || []);
      }
    } catch (e) {
      console.error('Error cargando dispositivos:', e);
    }
  }, [token]);

  useEffect(() => {
    fetchIncidentsAndStats();
    fetchDevices();
  }, [fetchIncidentsAndStats, fetchDevices]);

  // Conexión WebSockets en tiempo real
  useEffect(() => {
    const socket = io('/', {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });
    socketRef.current = socket;
    setSocketInstance(socket);

    socket.on('connect', () => {
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    // Nueva alerta sísmica o de inundación
    socket.on('incident:new', (alert) => {
      // Si el nodo está silenciado/muteado, no disparar sirenas sonoras ni banners críticos de alerta general
      if (alert.isMuted) {
        fetchIncidentsAndStats();
        fetchDevices();
        return;
      }

      if (audioEnabled) {
        if (alert.incidentType === 'sismo') {
          playAlarm();
        } else {
          playFloodAlert();
        }
      }

      setLiveAlerts((prev) => [alert, ...prev.slice(0, 24)]);
      setCriticalBanner(alert);
      showToast(
        `🚨 ${alert.title || 'Alerta Crítica'}`,
        'danger',
        alert.description
      );

      fetchIncidentsAndStats();
      fetchDevices();
    });

    // Actualización de Telemetría
    socket.on('telemetry:update', (data) => {
      setDevices((prev) =>
        prev.map((dev) =>
          dev.id === data.deviceId
            ? { ...dev, isOnline: true, lastSeen: new Date().toISOString(), location: data.location || dev.location }
            : dev
        )
      );
    });

    // Actualización de Heartbeat
    socket.on('heartbeat:new', (data) => {
      setDevices((prev) =>
        prev.map((dev) =>
          dev.id === data.deviceId
            ? {
                ...dev,
                isOnline: true,
                batteryLevel: data.batteryLevel ?? dev.batteryLevel,
                isCharging: data.isCharging ?? dev.isCharging,
                batteryTemp: data.batteryTemp ?? dev.batteryTemp,
                cpuTemp: data.cpuTemp ?? dev.cpuTemp,
                lastSeen: new Date().toISOString()
              }
            : dev
        )
      );
    });

    // Incidente resuelto o actualizado (apelaciones, etc.)
    socket.on('incident:resolved', () => {
      fetchIncidentsAndStats();
    });
    socket.on('incident:updated', () => {
      fetchIncidentsAndStats();
    });

    // Actualización de calibración de umbral de dispositivo
    socket.on('device:threshold_updated', (data) => {
      setDevices((prev) =>
        prev.map((dev) =>
          dev.id === data.deviceId
            ? { ...dev, movementThreshold: data.movementThreshold }
            : dev
        )
      );
    });

    // Actualización de configuración del dispositivo (intervalo de foto o umbral)
    socket.on('device:config_updated', (data) => {
      setDevices((prev) =>
        prev.map((dev) =>
          dev.id === data.deviceId
            ? {
                ...dev,
                photoIntervalMinutes: data.photoIntervalMinutes ?? dev.photoIntervalMinutes,
                movementThreshold: data.movementThreshold ?? dev.movementThreshold,
              }
            : dev
        )
      );
    });

    // Actualización de silencio / pausa de comunicación de nodo
    socket.on('device:mute_toggled', (data) => {
      setDevices((prev) =>
        prev.map((dev) =>
          dev.id === data.deviceId
            ? { ...dev, isMuted: data.isMuted }
            : dev
        )
      );
    });

    // Nueva evidencia fotográfica capturada por un nodo
    socket.on('device:evidence_new', (_data) => {
      showToast('Nueva Evidencia Capturada', 'info', `Foto recibida del nodo.`);
      fetchDevices();
      fetchIncidentsAndStats();
    });

    // Actualización de evidencia fotográfica (resultado OCR completado)
    socket.on('device:evidence_updated', (data) => {
      fetchDevices();
      fetchIncidentsAndStats();
      if (data?.evidence?.floodDetected) {
        showToast('🌊 Inundación Confirmada', 'danger', `Nivel de agua estimado: ${data.evidence.waterLevelCm} cm.`);
      }
    });

    // Nueva solicitud de administrador
    socket.on('admin:registration_request', (reqData) => {
      if (currentUser?.role === 'admin') {
        if (audioEnabled) playBeep(700, 200);
        showToast('Solicitud de Operador', 'warning', `"${reqData.name}" solicita cuenta de Administrador.`);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [audioEnabled, currentUser, fetchIncidentsAndStats, fetchDevices, showToast]);

  const handleLoginSuccess = (newToken, user) => {
    setToken(newToken);
    setCurrentUser(user);
    localStorage.setItem('sentinel_token', newToken);
    localStorage.setItem('sentinel_user', JSON.stringify(user));
    showToast(`Bienvenido Operador ${user.name}`, 'success');
  };

  const isAdmin = currentUser?.role === 'admin';
  const pendingNodesCount = devices.filter((d) => d.isAuthorized === false).length;

  return (
    <div className="min-h-screen bg-transparent text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">

      {/* TOP EMERGENCY BANNER (Si hay sismo violento o inundación activa) */}
      {criticalBanner && (
        <div className="bg-red-600 text-white px-4 py-2.5 shadow-2xl flex items-center justify-between animate-pulse sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <AlertOctagon className="w-5 h-5 flex-shrink-0" />
            <div className="text-xs sm:text-sm font-bold tracking-wide">
              <span>ALERTA DE EMERGENCIA ACTIVA: </span>
              <span className="font-mono underline">{criticalBanner.title}</span>
              <span className="opacity-90 ml-2 hidden md:inline">({criticalBanner.description})</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCriticalBanner(null)}
              className="p-1 hover:bg-red-700 rounded transition-colors text-white"
              title="Cerrar banner de alerta"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* HEADER PRINCIPAL ACIMES | SENTINEL */}
      <header className="border-b border-slate-800/90 bg-slate-950/85 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">

          {/* Logo & Tactical Identity ACIMES */}
          <div className="flex items-center gap-3.5">
            <div className="relative group cursor-pointer" onClick={() => setActiveTab('map')}>
              <div className="w-11 h-11 rounded-xl bg-slate-900/90 border border-cyan-500/30 p-1 flex items-center justify-center shadow-lg shadow-cyan-950/50 hover:border-cyan-400 transition-all">
                <img
                  src="/acimes_logo.png"
                  alt="ACIMES Logo"
                  className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(6,182,212,0.4)]"
                />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-widest text-white font-mono flex items-center gap-2">
                  <span className="text-cyan-400 font-extrabold">ACIMES</span>
                  <span className="text-slate-500 font-normal">|</span>
                  <span>SENTINEL</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30 flex items-center gap-1.5 shadow-sm shadow-emerald-950/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    SISTEMA ACTIVO
                  </span>
                </h1>
              </div>
              <p className="text-[10px] font-mono tracking-wider text-slate-400 uppercase">
                Centro de Operaciones de Emergencia &amp; Telemetría en Tiempo Real
              </p>
            </div>
          </div>

          {/* Tactical Metadata: Local Clock + WebSockets + Audio + Auth */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs font-mono">

            {/* Reloj de Operaciones */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-200">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] font-bold">{currentTime}</span>
            </div>

            {/* WebSockets Status */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] ${
                socketConnected
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-950/40 border-red-500/30 text-red-400 animate-pulse'
              }`}
            >
              {socketConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{socketConnected ? 'TELEMETRÍA EN VIVO' : 'RECONECTANDO'}</span>
            </div>

            {/* Audio Toggle */}
            <button
              type="button"
              onClick={() => {
                setAudioEnabled(!audioEnabled);
                if (!audioEnabled) playBeep(880, 150);
              }}
              className={`p-2 rounded-xl border transition-colors ${
                audioEnabled
                  ? 'bg-slate-900 border-slate-800 text-cyan-400 hover:border-slate-700'
                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
              title={audioEnabled ? 'Alarmas sonoras activadas' : 'Silenciado'}
            >
              {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Auth Button or User Badge */}
            {currentUser ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                <div className="text-right">
                  <div className="text-white font-bold text-xs truncate max-w-[120px]">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-cyan-400 uppercase tracking-wider">
                    {currentUser.role}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-red-950/60 border border-slate-800 hover:border-red-500/40 text-slate-400 hover:text-red-400 transition-colors"
                  title="Cerrar Sesión de Comando"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-900/30 transition-all"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Acceso Operador</span>
              </button>
            )}

          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-900 flex overflow-x-auto gap-2 py-2 tactical-scrollbar">
          {/* Tab 1: Mapa Táctico */}
          <button
            type="button"
            onClick={() => setActiveTab('map')}
            className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'map'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/40 shadow-md shadow-cyan-950'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <MapIcon className="w-4 h-4" />
            <span>Mapa Táctico &amp; Alertas</span>
            {incidents.filter((i) => i.status === 'activa').length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-600 text-white font-bold">
                {incidents.filter((i) => i.status === 'activa').length}
              </span>
            )}
          </button>

          {/* Tab 2: Historial & Reportes */}
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'reports'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/40 shadow-md shadow-cyan-950'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Historial &amp; Reportes</span>
          </button>

          {/* Admin Protected Tabs */}
          {isAdmin && (
            <>
              {/* Tab 3: Dispositivos & Nodos */}
              <button
                type="button"
                onClick={() => setActiveTab('devices')}
                className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'devices'
                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/40 shadow-md shadow-indigo-950'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Nodos &amp; Telemetría</span>
                {pendingNodesCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-slate-950 font-bold animate-pulse">
                    {pendingNodesCount}
                  </span>
                )}
              </button>

              {/* Tab 4: Simulador Android */}
              <button
                type="button"
                onClick={() => setActiveTab('simulator')}
                className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'simulator'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/40 shadow-md shadow-amber-950'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Cpu className="w-4 h-4" />
                <span>Simulador Android</span>
              </button>

              {/* Tab 5: Panel de Control & Auditoría */}
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'admin'
                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/40 shadow-md shadow-purple-950'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                <span>Seguridad &amp; Auditoría</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        {activeTab === 'map' && (
          <TacticalMapTab
            incidents={incidents}
            devices={devices}
            stats={stats}
            liveAlerts={liveAlerts}
            currentUser={currentUser}
            onSelectIncident={(inc) => setEvidenceModalData(inc)}
            onSelectDevice={(dev) => {
              if (isAdmin) {
                setActiveTab('devices');
              } else {
                showToast(`Nodo: ${dev.name}`, 'info', `Batería: ${dev.batteryLevel || 100}%`);
              }
            }}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsTab
            currentUser={currentUser}
            token={token}
            devices={devices}
            socket={socketInstance}
            onInspectReport={(rep) => setEvidenceModalData(rep)}
            onOpenResolve={(rep) => setResolveModalData(rep)}
          />
        )}

        {activeTab === 'devices' && isAdmin && (
          <DevicesTab
            devices={devices}
            token={token}
            onRefreshDevices={fetchDevices}
            onInspectDeviceSnapshot={(dev) => {
              const photo = dev.latestEvidence?.filePath || dev.latestPhotoUrl;
              setEvidenceModalData({
                title: `Última Captura - ${dev.name}`,
                evidence: dev.latestEvidence,
                evidenceUrl: photo,
                filePath: photo,
                location: dev.location,
                description: `Foto de monitoreo ambiental registrada por ${dev.model || 'Nodo Android'} (${dev.deviceIdentifier}).`
              });
            }}
          />
        )}

        {activeTab === 'simulator' && isAdmin && (
          <SimulatorTab
            devices={devices}
            onShowToast={showToast}
            onRefreshData={() => {
              fetchIncidentsAndStats();
              fetchDevices();
            }}
          />
        )}

        {activeTab === 'admin' && isAdmin && (
          <AdminPanelTab
            token={token}
            currentUser={currentUser}
            onShowToast={showToast}
            onInspectEvidence={(ev) => setEvidenceModalData(ev)}
          />
        )}
      </main>

      {/* MODALES */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {evidenceModalData && (
        <EvidenceModal
          incident={evidenceModalData}
          onClose={() => setEvidenceModalData(null)}
        />
      )}

      {resolveModalData && (
        <ResolveModal
          incident={resolveModalData}
          token={token}
          onClose={() => setResolveModalData(null)}
          onResolved={() => {
            fetchIncidentsAndStats();
            showToast('Incidente resuelto', 'success');
          }}
        />
      )}

      {/* TOASTS NOTIFICATIONS */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-xl border shadow-2xl font-mono text-xs backdrop-blur-md transition-all flex items-start gap-3 ${
              toast.type === 'danger'
                ? 'bg-red-950/90 border-red-500/50 text-red-200'
                : toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500/50 text-amber-200'
                : 'bg-slate-900/90 border-slate-700 text-slate-200'
            }`}
          >
            <div className="flex-1">
              <div className="font-bold">{toast.title}</div>
              {toast.message && <div className="text-[11px] opacity-80 mt-0.5">{toast.message}</div>}
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="opacity-60 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}

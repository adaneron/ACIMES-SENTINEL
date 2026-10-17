import { useState, useEffect, useCallback } from 'react';
import {
  UserCheck,
  Check,
  X,
  Shield,
  RefreshCw,
  FileText,
  Camera,
  Phone,
  Send,
  Plus,
  Trash2,
  Edit2,
  Bell,
  MessageSquare,
  Info,
  Download,
  Smartphone
} from 'lucide-react';

export default function AdminPanelTab({
  token,
  currentUser,
  onShowToast,
  onInspectEvidence
}) {
  const [adminUsers, setAdminUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [testingContactId, setTestingContactId] = useState(null);
  const [testingCustom, setTestingCustom] = useState(false);

  // Consenso Sísmico Multi-Nodo
  const [consensusDevices, setConsensusDevices] = useState(1);
  const [savingConsensus, setSavingConsensus] = useState(false);

  // Detección automática de Chat IDs en Telegram
  const [detectedTelegramChats, setDetectedTelegramChats] = useState([]);
  const [loadingTelegramChats, setLoadingTelegramChats] = useState(false);

  // Modal de Contactos de Emergencia
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContactId, setEditingContactId] = useState(null);

  const initialContactForm = {
    name: '',
    organization: '',
    phone: '',
    telegramChatId: '',
    notifyTelegram: true,
    notifySms: false,
    alertOnEarthquake: true,
    alertOnFlood: true,
    includeCoords: true,
    includePhoto: true,
    includeTimestamp: true,
    includeSeverity: true,
    isActive: true,
  };
  const [contactForm, setContactForm] = useState(initialContactForm);

  // Filtros de Auditoría
  const [logCategory, setLogCategory] = useState('');
  const [logSeverity, setLogSeverity] = useState('');

  // 1. Cargar Usuarios Administradores
  const fetchAdminUsers = useCallback(async () => {
    if (!token) return;
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/auth/admin-users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setAdminUsers(data.users || []);
      } else if (onShowToast) {
        onShowToast(data.error, 'danger');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'danger');
    } finally {
      setLoadingUsers(false);
    }
  }, [token, onShowToast]);

  // 2. Cargar Logs de Auditoría
  const fetchAuditLogs = useCallback(async () => {
    if (!token) return;
    setLoadingLogs(true);
    const params = new URLSearchParams({ limit: '60' });
    if (logCategory) params.set('category', logCategory);
    if (logSeverity) params.set('severity', logSeverity);

    try {
      const res = await fetch(`/api/auth/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.logs || []);
      } else if (onShowToast) {
        onShowToast(data.error, 'danger');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'danger');
    } finally {
      setLoadingLogs(false);
    }
  }, [token, logCategory, logSeverity, onShowToast]);

  // 3. Cargar Contactos de Emergencia & Canales de Autoridades
  const fetchContacts = useCallback(async () => {
    if (!token) return;
    setLoadingContacts(true);
    try {
      const res = await fetch('/api/emergency-contacts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setContacts(data.contacts || []);
      } else if (onShowToast) {
        onShowToast(data.error, 'danger');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'danger');
    } finally {
      setLoadingContacts(false);
    }
  }, [token, onShowToast]);

  // 4. Cargar Configuración de Consenso Sísmico Multi-Nodo
  const fetchConsensusSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/seismic-consensus');
      const data = await res.json();
      if (data.success && data.settings?.minDevices) {
        setConsensusDevices(data.settings.minDevices);
      }
    } catch (err) {
      console.warn('Error consultando consenso sísmico:', err);
    }
  }, []);

  useEffect(() => {
    fetchAdminUsers();
    fetchAuditLogs();
    fetchContacts();
    fetchConsensusSettings();
  }, [fetchAdminUsers, fetchAuditLogs, fetchContacts, fetchConsensusSettings]);

  // Guardar Regla de Consenso Sísmico
  const handleSaveConsensus = async () => {
    if (!token) return;
    setSavingConsensus(true);
    try {
      const res = await fetch('/api/settings/seismic-consensus', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ minDevices: Number(consensusDevices) })
      });
      const data = await res.json();
      if (data.success) {
        if (onShowToast) onShowToast(data.message || `Consenso actualizado: ${data.settings.minDevices} dispositivo(s)`, 'success');
        fetchAuditLogs();
      } else if (onShowToast) {
        onShowToast(data.error || 'Error al guardar regla de consenso', 'danger');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'danger');
    } finally {
      setSavingConsensus(false);
    }
  };

  // Detectar Chat IDs desde Telegram
  const handleFetchTelegramChats = async () => {
    if (!token) return;
    setLoadingTelegramChats(true);
    try {
      const res = await fetch('/api/emergency-contacts/telegram-chats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setDetectedTelegramChats(data.chats || []);
        if ((data.chats || []).length === 0) {
          if (onShowToast) onShowToast('No se encontraron chats recientes. Envía /start al bot @sentinelacimesbot primero.', 'info');
        } else if (onShowToast) {
          onShowToast(`Se detectaron ${data.chats.length} chat(s) en Telegram`, 'success');
        }
      } else if (onShowToast) {
        onShowToast(data.error || 'Error consultando Telegram', 'danger');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'danger');
    } finally {
      setLoadingTelegramChats(false);
    }
  };

  // Abrir WhatsApp con número formateado
  const handleOpenWhatsApp = (phone, name = 'Autoridad') => {
    if (!phone) return;
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0') && clean.length === 11) {
      clean = '58' + clean.slice(1);
    } else if (clean.length === 10 && (clean.startsWith('412') || clean.startsWith('414') || clean.startsWith('416') || clean.startsWith('424') || clean.startsWith('426'))) {
      clean = '58' + clean;
    }
    const msg = `🚨 *SENTINEL | CANAL OFICIAL DE EMERGENCIAS*\nEstimado/a ${name}, canal oficial de alertas y despacho táctico activo. Verificado vía plataforma SENTINEL.`;
    const url = `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Aprobar administrador
  const handleApproveAdmin = async (userId, name) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/auth/admin-users/${userId}/approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        if (onShowToast) onShowToast(`Operador "${name}" autorizado con éxito`, 'success');
        fetchAdminUsers();
        fetchAuditLogs();
      } else if (onShowToast) {
        onShowToast(data.error, 'danger');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'danger');
    }
  };

  // Rechazar administrador
  const handleRejectAdmin = async (userId, name) => {
    if (!token) return;
    if (!confirm(`¿Estás seguro de rechazar la solicitud de "${name}"?`)) return;

    try {
      const res = await fetch(`/api/auth/admin-users/${userId}/reject`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        if (onShowToast) onShowToast(`Solicitud de "${name}" rechazada`, 'info');
        fetchAdminUsers();
        fetchAuditLogs();
      } else if (onShowToast) {
        onShowToast(data.error, 'danger');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'danger');
    }
  };

  // Abrir Modal para Crear Contacto
  const handleOpenCreateContact = () => {
    setEditingContactId(null);
    setContactForm(initialContactForm);
    setShowContactModal(true);
  };

  // Abrir Modal para Editar Contacto
  const handleOpenEditContact = (contact) => {
    setEditingContactId(contact.id);
    setContactForm({
      name: contact.name || '',
      organization: contact.organization || '',
      phone: contact.phone || '',
      telegramChatId: contact.telegramChatId || '',
      notifyTelegram: Boolean(contact.notifyTelegram),
      notifySms: Boolean(contact.notifySms),
      alertOnEarthquake: Boolean(contact.alertOnEarthquake),
      alertOnFlood: Boolean(contact.alertOnFlood),
      includeCoords: Boolean(contact.includeCoords),
      includePhoto: Boolean(contact.includePhoto),
      includeTimestamp: Boolean(contact.includeTimestamp),
      includeSeverity: Boolean(contact.includeSeverity),
      isActive: Boolean(contact.isActive),
    });
    setShowContactModal(true);
  };

  // Guardar Contacto (Crear o Actualizar)
  const handleSaveContact = async (e) => {
    if (e) e.preventDefault();
    if (!contactForm.name.trim()) {
      if (onShowToast) onShowToast('El nombre de la autoridad o contacto es obligatorio', 'warning');
      return;
    }

    try {
      const url = editingContactId
        ? `/api/emergency-contacts/${editingContactId}`
        : '/api/emergency-contacts';
      const method = editingContactId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(contactForm)
      });
      const data = await res.json();
      if (data.success) {
        if (onShowToast) onShowToast(data.message || 'Contacto de emergencia guardado con éxito', 'success');
        setShowContactModal(false);
        fetchContacts();
        fetchAuditLogs();
      } else if (onShowToast) {
        onShowToast(data.error || 'Error al guardar contacto', 'danger');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'danger');
    }
  };

  // Eliminar Contacto
  const handleDeleteContact = async (id, name) => {
    if (!confirm(`¿Eliminar al contacto de emergencia "${name}"? No recibirá más alertas automáticas.`)) return;
    try {
      const res = await fetch(`/api/emergency-contacts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        if (onShowToast) onShowToast(`Contacto "${name}" eliminado`, 'info');
        fetchContacts();
        fetchAuditLogs();
      } else if (onShowToast) {
        onShowToast(data.error, 'danger');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'danger');
    }
  };

  // Probar Envío a un Contacto por Telegram
  const handleTestContact = async (contact) => {
    if (!contact.telegramChatId) {
      if (onShowToast) onShowToast(`El contacto "${contact.name}" no tiene ID de chat de Telegram configurado`, 'warning');
      return;
    }

    setTestingContactId(contact.id);
    try {
      const res = await fetch(`/api/emergency-contacts/${contact.id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        if (onShowToast) onShowToast(`✅ Mensaje de prueba entregado a ${contact.name} en Telegram`, 'success');
      } else {
        if (onShowToast) onShowToast(`❌ ${data.error}. Tip: ${data.tip || 'Inicia el bot en Telegram'}`, 'danger');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'danger');
    } finally {
      setTestingContactId(null);
    }
  };

  // Probar Chat ID personalizado desde dentro del Modal
  const handleTestCustomChatId = async () => {
    if (!contactForm.telegramChatId.trim()) {
      if (onShowToast) onShowToast('Ingresa un Chat ID de Telegram para probar', 'warning');
      return;
    }

    setTestingCustom(true);
    try {
      const res = await fetch('/api/emergency-contacts/test-custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          telegramChatId: contactForm.telegramChatId.trim(),
          name: contactForm.name || 'Contacto de Emergencia'
        })
      });
      const data = await res.json();
      if (data.success) {
        if (onShowToast) onShowToast('✅ ¡Conexión con Telegram verificada! Mensaje recibido en el chat.', 'success');
      } else {
        if (onShowToast) onShowToast(`❌ ${data.error}. Recuerda presionar /start en @sentinelacimesbot`, 'danger');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'danger');
    } finally {
      setTestingCustom(false);
    }
  };

  const pendingAdmins = adminUsers.filter((u) => u.isApproved === false);
  const activeAdmins = adminUsers.filter((u) => u.isApproved !== false);

  return (
    <div className="space-y-6">

      {/* Header Panel */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              CENTRO DE CONTROL ADMINISTRATIVO
            </span>
            <span className="text-xs font-mono text-slate-400">
              SEGURIDAD, DESPACHO &amp; AUDITORÍA FORENSE
            </span>
          </div>
          <h2 className="text-xl font-black text-white tracking-wide">
            Gestión de Operadores, Contactos y Auditoría del Sistema
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Autoriza cuentas de mando, configura canales de alerta a autoridades y supervisa cada evento crítico registrado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              fetchAdminUsers();
              fetchAuditLogs();
              fetchContacts();
            }}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs flex items-center gap-2 transition-colors border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers || loadingLogs || loadingContacts ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
        </div>
      </div>

      {/* Grid: Solicitudes de Admins + Admins Activos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. Solicitudes Pendientes de Aprobación */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Solicitudes de Operadores Pendientes</h3>
                  <span className="text-[10px] font-mono text-slate-400">
                    Requieren verificación de credenciales
                  </span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${pendingAdmins.length > 0 ? 'bg-amber-500/20 text-amber-400 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
                {pendingAdmins.length} Pendiente{pendingAdmins.length !== 1 ? 's' : ''}
              </span>
            </div>

            {pendingAdmins.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-xs font-mono">
                No hay solicitudes de nuevos operadores pendientes.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingAdmins.map((user) => (
                  <div
                    key={user.id}
                    className="p-3.5 rounded-xl bg-slate-950/80 border border-amber-500/30 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white truncate">{user.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-amber-500/20 text-amber-400">
                          Pendiente
                        </span>
                      </div>
                      <div className="text-xs font-mono text-slate-400 truncate">{user.email}</div>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                        Registrado: {new Date(user.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleApproveAdmin(user.id, user.name)}
                        className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/30 transition-colors cursor-pointer"
                        title="Aprobar Operador"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectAdmin(user.id, user.name)}
                        className="p-2 rounded-lg bg-red-600/30 hover:bg-red-600 text-red-300 hover:text-white transition-colors cursor-pointer"
                        title="Rechazar y Eliminar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 2. Operadores Activos y Autorizados */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Operadores Autorizados</h3>
                  <span className="text-[10px] font-mono text-slate-400">
                    Cuentas con acceso de mando y resolución
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-500/20 text-indigo-400">
                {activeAdmins.length} Activo{activeAdmins.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto tactical-scrollbar pr-1">
              {activeAdmins.map((user) => {
                const isCurrent = currentUser?.id === user.id;
                return (
                  <div
                    key={user.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${isCurrent ? 'bg-indigo-950/30 border-indigo-500/50' : 'bg-slate-950/60 border-slate-800'}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white truncate">{user.name}</span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-indigo-500/20 text-indigo-400">
                            Tú
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-400">
                          {user.role}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">{user.email}</div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className="text-[10px] font-mono text-slate-500 block">
                        {user.approvedAt ? `Aprobado ${new Date(user.approvedAt).toLocaleDateString()}` : 'Admin Principal'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* 2.5 Panel de Consenso Sísmico Multi-Nodo (Prevención de Falsos Positivos) */}
      <div className="p-5 rounded-2xl bg-[#0b101b] border border-amber-500/30 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">
                  Consenso Sísmico Multi-Nodo (Filtro Antirruido)
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  ANTI FALSOS POSITIVOS
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Avisar en panel general cuando la alerta ocurra en X cantidad de dispositivos al mismo tiempo.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveConsensus}
            disabled={savingConsensus}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold font-mono flex items-center gap-2 shadow-lg shadow-amber-900/40 transition cursor-pointer self-start sm:self-auto disabled:opacity-50"
          >
            <span>{savingConsensus ? 'Guardando...' : '💾 Guardar Regla de Consenso'}</span>
          </button>
        </div>

        {/* Control de Slider y Regla Dinámica */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3 font-mono">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="text-slate-300 font-bold">
              Cantidad de nodos simultáneos requeridos para alertar:
            </span>
            <span className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-sm self-start sm:self-auto">
              {consensusDevices} {consensusDevices === 1 ? 'dispositivo (Disparo Inmediato)' : 'dispositivos simultáneos'}
            </span>
          </div>

          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={consensusDevices}
            onChange={(e) => setConsensusDevices(parseInt(e.target.value, 10))}
            className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />

          <div className="flex justify-between text-[10px] text-slate-500">
            <span>1 Nodo (Inmediato)</span>
            <span>2 Nodos (Mínimo recomendado)</span>
            <span>3 Nodos</span>
            <span>4 Nodos</span>
            <span>5 Nodos (Alta exigencia)</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] flex items-start gap-2.5">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-slate-300 space-y-1">
              {consensusDevices === 1 ? (
                <p className="text-amber-400 font-bold">
                  ⚡ Modo Inmediato: Cualquier teléfono o nodo que registre sacudida telúrica disparará de inmediato la alarma general, sirena audible y el despacho por Telegram.
                </p>
              ) : (
                <p className="text-emerald-400 font-bold">
                  🛡️ Modo Consenso Activo: Si un único dispositivo cae o recibe un golpe físico accidental, se archivará como pre-alerta silenciosa. Solo cuando al menos {consensusDevices} nodos registren sacudida en la ventana de 15 segundos se disparará la alarma general en el panel y el despacho a las autoridades.
                </p>
              )}
              <p className="text-slate-400 text-[10px]">
                Ventana de correlación: 15 segundos &bull; Aplica exclusivamente a nodos Centinela autorizados en la red territorial.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2.5 Panel de Descarga de la Aplicación Móvil Centinela (APK) */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-cyan-950/20 to-slate-900/90 border border-cyan-500/30 flex flex-col gap-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">
                  Aplicación Móvil para Nodos Centinela (Android APK)
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  BUILD DISPONIBLE &bull; v1.0.0
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Convierte cualquier smartphone Android en un nodo de monitoreo sísmico continuo y captura de evidencia fotográfica por IA.
              </p>
            </div>
          </div>

          <a
            href="/api/downloads/centinela-apk"
            download="Centinela-ACIMES.apk"
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white text-xs font-bold font-mono flex items-center justify-center gap-2.5 shadow-lg shadow-cyan-900/50 hover:shadow-cyan-800/60 transition cursor-pointer self-start sm:self-auto shrink-0"
          >
            <Download className="w-4 h-4 animate-bounce" />
            <span>Descargar Centinela APK (17 MB)</span>
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center text-[11px] shrink-0">
              1
            </div>
            <div>
              <div className="font-bold text-slate-200">Descargar en Teléfono</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Descarga el archivo APK directamente desde este botón al dispositivo móvil.
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center text-[11px] shrink-0">
              2
            </div>
            <div>
              <div className="font-bold text-slate-200">Permitir Instalación</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Habilita &ldquo;Instalar apps desconocidas&rdquo; en Ajustes y concede permisos de Cámara y GPS.
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center text-[11px] shrink-0">
              3
            </div>
            <div>
              <div className="font-bold text-slate-200">Vincular Nodo</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Ingresa la URL del servidor y autoriza el nuevo nodo desde la pestaña &ldquo;Nodos&rdquo;.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Canales de Alerta Oficial & Despacho a Autoridades (Telegram y SMS) */}
      <div className="p-5 rounded-2xl bg-[#0b101b] border border-cyan-500/30 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">
                  Canales de Alerta Oficial &amp; Despacho a Autoridades
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                  TELEGRAM &bull; BOT OFICIAL
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Registra contactos oficiales (Protección Civil, Bomberos, Cuadrantes de Paz) para despacho automatizado ante sismos o inundaciones.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenCreateContact}
            className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold font-mono flex items-center gap-2 shadow-lg shadow-cyan-900/40 transition cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Registrar Contacto de Emergencia
          </button>
        </div>

        {/* Tarjeta Informativa del Bot de Telegram */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2.5 text-slate-300">
            <MessageSquare className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <div>
              <span>Bot Telegram Activo: </span>
              <strong className="text-cyan-400">@sentinelacimesbot</strong>
              <span className="text-slate-500 ml-2 hidden sm:inline">(Token oficial enlazado)</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-amber-400" />
            <span>Para recibir alertas, la autoridad debe presionar <strong>/start</strong> en el bot o agregarlo al grupo de guardia.</span>
          </div>
        </div>

        {/* Lista de Contactos de Emergencia */}
        {contacts.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-xl">
            No hay contactos de emergencia registrados. Haz clic en "Registrar Contacto de Emergencia" para agregar autoridades y activar el despacho por Telegram.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className={`p-4 rounded-xl border flex flex-col justify-between gap-3 transition ${
                  contact.isActive
                    ? 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    : 'bg-slate-950/40 border-slate-900 opacity-60'
                }`}
              >
                <div>
                  {/* Encabezado Contacto */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-sm">{contact.name}</h4>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                          contact.isActive
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-500'
                        }`}>
                          {contact.isActive ? 'ACTIVO' : 'PAUSADO'}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-cyan-400 block mt-0.5">
                        {contact.organization || 'Organismo de Seguridad'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditContact(contact)}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Editar configuración"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteContact(contact.id, contact.name)}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-red-950/50 text-slate-400 hover:text-red-400 transition cursor-pointer"
                        title="Eliminar contacto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Medios de Contacto */}
                  <div className="space-y-1 text-xs font-mono text-slate-400 mb-3">
                    {contact.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span>Teléfono / SMS: <strong className="text-slate-200">{contact.phone}</strong></span>
                      </div>
                    )}
                    {contact.notifyTelegram && (
                      <div className="flex items-center gap-2">
                        <Send className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Chat ID Telegram: <strong className="text-cyan-300">{contact.telegramChatId || 'Sin ID'}</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Eventos Suscritos */}
                  <div className="mb-2">
                    <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                      Eventos que alertan a este contacto:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {contact.alertOnEarthquake && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-red-500/20 text-red-400 border border-red-500/30">
                          🚨 Sismos
                        </span>
                      )}
                      {contact.alertOnFlood && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                          🌊 Inundaciones
                        </span>
                      )}
                      {!contact.alertOnEarthquake && !contact.alertOnFlood && (
                        <span className="text-[10px] text-amber-500 font-mono">Sin eventos asignados</span>
                      )}
                    </div>
                  </div>

                  {/* Información Incluida */}
                  <div>
                    <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                      Datos incluidos en el despacho:
                    </span>
                    <div className="flex flex-wrap gap-1 text-[10px] font-mono text-slate-400">
                      {contact.includeCoords && <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">📍 Coordenadas</span>}
                      {contact.includePhoto && <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">📸 Foto Evidencia</span>}
                      {contact.includeTimestamp && <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">🕒 Hora Local</span>}
                      {contact.includeSeverity && <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">⚡ Severidad</span>}
                    </div>
                  </div>
                </div>

                {/* Botones de Prueba y Despacho en Vivo */}
                <div className="pt-3 border-t border-slate-900 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-slate-500">
                    Despacho automático: {contact.isActive ? 'Habilitado' : 'Deshabilitado'}
                  </span>
                  <div className="flex items-center gap-2">
                    {contact.phone && (
                      <button
                        type="button"
                        onClick={() => handleOpenWhatsApp(contact.phone, contact.name)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                        title="Abrir chat oficial en WhatsApp"
                      >
                        <span>💬 WhatsApp</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleTestContact(contact)}
                      disabled={testingContactId === contact.id}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Send className={`w-3 h-3 ${testingContactId === contact.id ? 'animate-spin' : ''}`} />
                      <span>{testingContactId === contact.id ? 'Probando...' : 'Probar Alerta Telegram'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Registro de Auditoría Forense */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Registro de Auditoría Forense</h3>
              <span className="text-[10px] font-mono text-slate-400">
                Trazabilidad inmutable de accesos, telemetría, evidencias y despachos oficiales
              </span>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2">
            <select
              value={logCategory}
              onChange={(e) => setLogCategory(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="">Todas las categorías</option>
              <option value="auth">Seguridad &amp; Auth</option>
              <option value="devices">Dispositivos Nodos</option>
              <option value="evidence">Fotos &amp; Evidencias</option>
              <option value="reports">Reportes &amp; Alertas</option>
              <option value="system">Sistema &amp; Despachos</option>
              <option value="cleanup">Limpieza / Retención</option>
            </select>

            <select
              value={logSeverity}
              onChange={(e) => setLogSeverity(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="">Todas las severidades</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="danger">Crítico / Alerta</option>
            </select>
          </div>
        </div>

        {/* Tabla / Lista de Logs */}
        {auditLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs font-mono">
            No se encontraron eventos de auditoría con los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-800/80 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3">Hora (HLV)</th>
                  <th className="py-2.5 px-3">Categoría</th>
                  <th className="py-2.5 px-3">Severidad</th>
                  <th className="py-2.5 px-3">Acción</th>
                  <th className="py-2.5 px-3">Detalle Operacional</th>
                  <th className="py-2.5 px-3 text-right">Evidencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {auditLogs.map((log) => {
                  const hasPhoto = log.metadata?.photoUrl || log.metadata?.filePath;
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap text-[11px]">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
                          {log.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            log.severity === 'danger' || log.severity === 'critical'
                              ? 'bg-red-500/20 text-red-400'
                              : log.severity === 'warning'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {log.severity}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-white font-bold whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 max-w-md truncate">
                        {log.description}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {hasPhoto ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (onInspectEvidence) {
                                onInspectEvidence({
                                  title: log.action,
                                  evidenceUrl: log.metadata.photoUrl || log.metadata.filePath,
                                  description: log.description
                                });
                              }
                            }}
                            className="p-1 px-2 rounded bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white transition-colors text-[10px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Camera className="w-3 h-3" />
                            Ver Foto
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL PARA CREAR / EDITAR CONTACTO DE EMERGENCIA */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0b101b] border border-cyan-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto tactical-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-base text-white">
                  {editingContactId ? 'Editar Contacto de Emergencia' : 'Registrar Contacto Oficial / Autoridad'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4 text-xs font-mono">
              {/* Nombre y Cargo */}
              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">
                  Nombre del Contacto / Organismo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Protección Civil Anzoátegui / Capitán Ramírez"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">
                  Organización o Jurisdicción
                </label>
                <input
                  type="text"
                  placeholder="Ej: Bomberos Barcelona / Cuadrante de Paz 04"
                  value={contactForm.organization}
                  onChange={(e) => setContactForm({ ...contactForm, organization: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 text-xs"
                />
              </div>

              {/* Teléfono & Telegram Chat ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-bold block">
                      Teléfono Móvil (WhatsApp / SMS)
                    </label>
                    {contactForm.phone && (
                      <button
                        type="button"
                        onClick={() => handleOpenWhatsApp(contactForm.phone, contactForm.name)}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-mono flex items-center gap-1 cursor-pointer"
                        title="Probar enlace de WhatsApp"
                      >
                        <span>💬 Probar WhatsApp</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="tel"
                    placeholder="+58 412 1234567"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-bold block">
                      Chat ID Telegram *
                    </label>
                    <button
                      type="button"
                      onClick={handleFetchTelegramChats}
                      disabled={loadingTelegramChats}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-mono flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Consultar usuarios que han enviado /start al bot"
                    >
                      <span>{loadingTelegramChats ? 'Buscando...' : '🔍 Detectar Chat ID'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Ej: 1302902413 o @Adaneitor"
                    value={contactForm.telegramChatId}
                    onChange={(e) => setContactForm({ ...contactForm, telegramChatId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 text-xs"
                  />
                </div>
              </div>

              {/* Selector Rápido de Chats Detectados en Telegram */}
              {detectedTelegramChats.length > 0 && (
                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-cyan-500/30 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-cyan-300 font-bold">
                      Chats detectados en @sentinelacimesbot (clic para auto-completar):
                    </span>
                    <span className="text-slate-500">{detectedTelegramChats.length} encontrado(s)</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {detectedTelegramChats.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setContactForm({
                            ...contactForm,
                            telegramChatId: c.id,
                            name: contactForm.name || c.name || '',
                          });
                          if (onShowToast) onShowToast(`Chat ID seleccionado: ${c.id} (${c.name})`, 'success');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border transition cursor-pointer flex items-center gap-1.5 ${
                          contactForm.telegramChatId === c.id
                            ? 'bg-cyan-600 text-white border-cyan-400 font-bold'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-cyan-500 hover:text-cyan-300'
                        }`}
                      >
                        <span>{c.username ? `${c.username}` : c.name}</span>
                        <span className="text-[9px] opacity-70">[{c.id}]</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Botón de Test de Chat ID en Vivo */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-[11px] text-slate-400">
                  ¿Quieres verificar si el Chat ID recibe mensajes?
                </span>
                <button
                  type="button"
                  onClick={handleTestCustomChatId}
                  disabled={testingCustom || !contactForm.telegramChatId}
                  className="px-2.5 py-1 rounded bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/40 text-[11px] font-bold transition disabled:opacity-40 cursor-pointer"
                >
                  {testingCustom ? 'Probando...' : 'Verificar en Telegram'}
                </button>
              </div>

              {/* Canales Activos */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <span className="text-[11px] font-bold text-slate-300 block">Canales de Notificación:</span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={contactForm.notifyTelegram}
                      onChange={(e) => setContactForm({ ...contactForm, notifyTelegram: e.target.checked })}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                    />
                    <span>Enviar por Telegram</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={contactForm.notifySms}
                      onChange={(e) => setContactForm({ ...contactForm, notifySms: e.target.checked })}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                    />
                    <span>Despachar por SMS (App)</span>
                  </label>
                </div>
              </div>

              {/* Casillas de Eventos */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <span className="text-[11px] font-bold text-slate-300 block">
                  Eventos a alertar a este contacto:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/80 border border-slate-800 cursor-pointer hover:border-red-500/50">
                    <input
                      type="checkbox"
                      checked={contactForm.alertOnEarthquake}
                      onChange={(e) => setContactForm({ ...contactForm, alertOnEarthquake: e.target.checked })}
                      className="rounded border-slate-700 text-red-500 focus:ring-0"
                    />
                    <span className="text-red-400 font-bold">Alertar por sismos</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/80 border border-slate-800 cursor-pointer hover:border-cyan-500/50">
                    <input
                      type="checkbox"
                      checked={contactForm.alertOnFlood}
                      onChange={(e) => setContactForm({ ...contactForm, alertOnFlood: e.target.checked })}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                    />
                    <span className="text-cyan-400 font-bold">Alertar por inundaciones</span>
                  </label>
                </div>
              </div>

              {/* Casillas de Información a Incluir */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <span className="text-[11px] font-bold text-slate-300 block">
                  Incluir información en la alerta:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={contactForm.includeCoords}
                      onChange={(e) => setContactForm({ ...contactForm, includeCoords: e.target.checked })}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                    />
                    <span>Coordenadas GPS y Mapa</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={contactForm.includePhoto}
                      onChange={(e) => setContactForm({ ...contactForm, includePhoto: e.target.checked })}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                    />
                    <span>Prueba fotográfica (incluso si es sismo)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={contactForm.includeTimestamp}
                      onChange={(e) => setContactForm({ ...contactForm, includeTimestamp: e.target.checked })}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                    />
                    <span>Hora y fecha exacta (HLV)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={contactForm.includeSeverity}
                      onChange={(e) => setContactForm({ ...contactForm, includeSeverity: e.target.checked })}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                    />
                    <span>Nivel de severidad y telemetría</span>
                  </label>
                </div>
              </div>

              {/* Estado Activo */}
              <div className="flex items-center gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={contactForm.isActive}
                    onChange={(e) => setContactForm({ ...contactForm, isActive: e.target.checked })}
                    className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                  />
                  <span className="font-bold">Contacto Activo para Despacho Inmediato</span>
                </label>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition shadow-lg shadow-cyan-900/40 cursor-pointer"
                >
                  {editingContactId ? 'Actualizar Contacto' : 'Guardar Contacto Oficial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

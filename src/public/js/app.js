/**
 * Lógica Principal de la Plataforma Web RALLY 2026
 * Maneja WebSockets (Socket.IO), estado reactivo, autenticación y vistas
 */

let socket = null;
let audioEnabled = true;
let currentUser = null;
let currentReportsPage = 1;

// ============================================================================
// AUDIO SINTETIZADO PARA ALERTAS DE EMERGENCIA (Web Audio API)
// ============================================================================
function playAlertChime(type = 'sismo') {
  if (!audioEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type === 'sismo' ? 'sawtooth' : 'sine';
    // Sirena modulada
    const now = audioCtx.currentTime;
    if (type === 'sismo') {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.6);
    } else {
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.25);
    }

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.7);
  } catch (e) {
    console.warn('Audio no disponible o bloqueado por el navegador hasta interacción del usuario.');
  }
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================
function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const bgColors = {
    info: 'bg-slate-900 border-slate-700 text-slate-100',
    success: 'bg-emerald-950 border-emerald-600/40 text-emerald-100',
    warning: 'bg-amber-950 border-amber-600/40 text-amber-100',
    danger: 'bg-red-950 border-red-600/50 text-red-100',
  };

  const icons = {
    info: 'fa-circle-info text-blue-400',
    success: 'fa-circle-check text-emerald-400',
    warning: 'fa-triangle-exclamation text-amber-400',
    danger: 'fa-radiation text-red-400 animate-pulse',
  };

  const toast = document.createElement('div');
  toast.className = `toast-alert pointer-events-auto p-4 rounded-xl border shadow-2xl flex items-start gap-3 backdrop-blur-md ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} text-lg mt-0.5"></i>
    <div class="flex-1">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-bold uppercase tracking-wider">${title}</h4>
        <span class="text-[10px] opacity-70">${new Date().toLocaleTimeString()}</span>
      </div>
      <p class="text-xs mt-0.5 opacity-90">${message}</p>
    </div>
    <button class="text-slate-400 hover:text-white p-0.5" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-xmark text-xs"></i>
    </button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'all 0.5s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 500);
  }, 6000);
}
window.showToast = showToast;

// ============================================================================
// INICIALIZACIÓN DE SOCKET.IO Y EVENTOS EN TIEMPO REAL
// ============================================================================
function initSocket() {
  socket = io();

  const wsStatusEl = document.getElementById('ws-status');

  socket.on('connect', () => {
    console.log('⚡ Conectado al servidor WebSocket en tiempo real.');
    if (wsStatusEl) {
      wsStatusEl.innerHTML = `<i class="fa-solid fa-circle-dot text-emerald-400 text-[10px]"></i><span>WebSockets Conectado</span>`;
    }
  });

  socket.on('disconnect', () => {
    console.warn('⚠️ Desconectado del WebSocket.');
    if (wsStatusEl) {
      wsStatusEl.innerHTML = `<i class="fa-solid fa-circle-dot text-amber-400 text-[10px]"></i><span>Reconectando...</span>`;
    }
  });

  // Evento: Nueva Incidencia / Alerta Crítica (Sismo o Inundación)
  socket.on('incident:new', (incident) => {
    console.log('🚨 Nueva incidencia recibida:', incident);
    playAlertChime(incident.incidentType);

    const typeLabels = {
      sismo: 'Alerta de Sismo',
      inundacion: 'Inundación Detectada',
      bateria_critica: 'Batería Crítica',
    };
    showToast(typeLabels[incident.incidentType] || 'Nueva Incidencia', incident.title, 'danger');

    // Mostrar banner superior si es crítica o alta
    if (incident.severity === 'alta' || incident.severity === 'critica') {
      showCriticalAlertBanner(incident);
    }

    // Actualizar marcador en mapa
    if (window.addIncidentMarker) {
      window.addIncidentMarker(incident);
    }

    // Agregar a la lista de alertas en vivo
    prependLiveAlert(incident);

    // Refrescar lista de informes y estadísticas
    loadStats();
    loadReports(currentReportsPage);
  });

  // Evento: Incidencia actualizada (resuelta)
  socket.on('incident:updated', (incident) => {
    showToast('Incidencia Actualizada', `La incidencia ha sido marcada como: ${incident.status}`, 'info');
    loadStats();
    loadReports(currentReportsPage);
  });

  // Evento: Telemetría de dispositivo (GPS / Acelerómetro)
  socket.on('telemetry:update', (data) => {
    if (data.latitude && data.longitude) {
      // Si el mapa tiene este dispositivo, actualiza su pin
      const dev = {
        id: data.deviceId,
        name: 'Dispositivo Android',
        isOnline: true,
        location: { latitude: data.latitude, longitude: data.longitude },
      };
      if (window.updateDeviceMarker) {
        window.updateDeviceMarker(dev);
      }
    }
  });

  // Evento: Heartbeat
  socket.on('heartbeat:update', (data) => {
    updateDeviceCardHeartbeat(data);
  });

  // Evento: Nueva evidencia fotográfica de cámara
  socket.on('device:evidence_new', (data) => {
    loadDevices();
    loadReports(currentReportsPage);
  });

  // Evento: Solicitud de registro de nuevo nodo Centinela
  socket.on('node:registration_request', (node) => {
    playAlertChime('nodo');
    showToast('Nuevo Nodo Centinela', `El dispositivo "${node.name}" (${node.model || 'Android'}) solicita autorización para unirse a la red.`, 'warning');
    loadDevices();
  });

  // Evento: Nodo autorizado
  socket.on('node:authorized', (node) => {
    showToast('Nodo Autorizado', `El nodo "${node.name}" ha sido autorizado y está listo para transmitir.`, 'success');
    loadDevices();
  });

  // Evento: Cambio de estado de dispositivo (online / offline)
  socket.on('device:status_change', (data) => {
    const isOnline = data.status === 'online';
    showToast(
      isOnline ? 'Dispositivo Conectado' : 'Dispositivo Desconectado',
      `El dispositivo ${data.deviceName || data.deviceId} está ahora ${data.status.toUpperCase()}.`,
      isOnline ? 'success' : 'warning'
    );
    loadDevices();
    loadStats();
  });

  // Evento: Registro de Auditoría en vivo (Solo Admins)
  socket.on('audit:new', () => {
    if (currentUser && currentUser.role === 'admin') {
      loadAuditLogs();
    }
  });

  // Evento: Solicitud de registro de nuevo Administrador
  socket.on('admin:registration_request', (reg) => {
    if (currentUser && currentUser.role === 'admin') {
      playAlertChime('nodo');
      showToast('Solicitud de Administrador', `El usuario "${reg.name}" (${reg.email}) solicita autorización como administrador.`, 'warning');
      loadAdminUsers();
      loadAuditLogs();
    }
  });

  // Evento: Administrador aprobado o rechazado
  socket.on('admin:approved', () => {
    if (currentUser && currentUser.role === 'admin') {
      loadAdminUsers();
      loadAuditLogs();
    }
  });

  socket.on('admin:rejected', () => {
    if (currentUser && currentUser.role === 'admin') {
      loadAdminUsers();
      loadAuditLogs();
    }
  });
}

// ============================================================================
// GESTIÓN DE BANNER CRÍTICO
// ============================================================================
function showCriticalAlertBanner(incident) {
  const banner = document.getElementById('critical-alert-banner');
  const typeEl = document.getElementById('banner-incident-type');
  const titleEl = document.getElementById('banner-incident-title');
  const descEl = document.getElementById('banner-incident-desc');

  if (banner && typeEl && titleEl && descEl) {
    typeEl.textContent = `${(incident.incidentType || 'ALERTA').toUpperCase()} - SEVERIDAD ${incident.severity?.toUpperCase()}`;
    titleEl.textContent = incident.title;
    descEl.textContent = incident.description || '';
    banner.classList.remove('hidden');
  }
}

// ============================================================================
// CARGA DE DATOS: ESTADÍSTICAS KPI Y ALERTAS EN VIVO
// ============================================================================
async function loadStats() {
  try {
    const res = await fetch('/api/reports/stats');
    const data = await res.json();
    if (data.success) {
      document.getElementById('kpi-incidents-active').textContent = data.stats.active;
      document.getElementById('kpi-sismos-count').textContent = data.stats.byType.sismo;
      document.getElementById('kpi-floods-count').textContent = data.stats.byType.inundacion;
      document.getElementById('reports-counter').textContent = data.stats.active;
    }
  } catch (e) {
    console.error('Error al cargar stats:', e);
  }
}

async function loadActiveAlerts() {
  try {
    const res = await fetch('/api/public/active-alerts');
    const data = await res.json();
    if (data.success) {
      const list = document.getElementById('live-alerts-list');
      if (!list) return;

      if (data.alerts.length === 0) {
        list.innerHTML = `
          <div class="text-center py-12 text-slate-500 text-xs">
            <i class="fa-solid fa-shield-cat text-3xl mb-2 text-slate-600 block"></i>
            Sin incidentes críticos pendientes.
          </div>
        `;
        return;
      }

      list.innerHTML = '';
      data.alerts.forEach((alert) => {
        prependLiveAlert(alert);
        if (window.addIncidentMarker) {
          window.addIncidentMarker(alert);
        }
      });
    }
  } catch (e) {
    console.error('Error al cargar alertas:', e);
  }
}

function prependLiveAlert(alert) {
  const list = document.getElementById('live-alerts-list');
  if (!list) return;

  const isQuake = alert.incidentType === 'sismo';
  const iconClass = isQuake ? 'fa-triangle-exclamation text-red-400' : 'fa-water text-cyan-400';
  const borderClass = isQuake ? 'border-red-500/30 bg-red-950/20' : 'border-cyan-500/30 bg-cyan-950/20';

  const alertItem = document.createElement('div');
  alertItem.className = `p-3 rounded-xl border ${borderClass} space-y-1.5 transition hover:bg-slate-800/60 cursor-pointer`;
  alertItem.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase text-white">
        <i class="fa-solid ${iconClass}"></i>
        ${alert.incidentType}
      </span>
      <span class="text-[10px] text-slate-400 font-mono">${new Date(alert.detectedAt).toLocaleTimeString()}</span>
    </div>
    <h4 class="text-xs font-semibold text-slate-100">${alert.title}</h4>
    <p class="text-[11px] text-slate-400 line-clamp-2">${alert.description || ''}</p>
    <div class="flex items-center justify-between pt-1 text-[10px] text-slate-500">
      <span>${alert.deviceName || 'Android'}</span>
      <span class="text-blue-400 hover:underline">Ver en mapa &rarr;</span>
    </div>
  `;

  alertItem.addEventListener('click', () => {
    if (alert.latitude && alert.longitude && window.centerMapAt) {
      window.centerMapAt(alert.latitude, alert.longitude, 14);
      // Cambiar a pestaña mapa si estamos en otra
      switchTab('tab-map');
    }
  });

  list.prepend(alertItem);
}

// ============================================================================
// CARGA DE INFORMES CON FILTROS Y PAGINACIÓN
// ============================================================================
async function loadReports(page = 1) {
  currentReportsPage = page;
  const tbody = document.getElementById('reports-table-body');
  if (!tbody) return;

  const type = document.getElementById('filter-type')?.value || '';
  const severity = document.getElementById('filter-severity')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';
  const deviceId = document.getElementById('filter-device')?.value || '';

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: '15',
  });
  if (type) queryParams.set('type', type);
  if (severity) queryParams.set('severity', severity);
  if (status) queryParams.set('status', status);
  if (deviceId) queryParams.set('deviceId', deviceId);

  try {
    const res = await fetch(`/api/reports?${queryParams.toString()}`);
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-400">Error: ${data.error}</td></tr>`;
      return;
    }

    if (data.reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-500">No se encontraron informes con los filtros seleccionados.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    data.reports.forEach((rep) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition';

      // Severidad badge
      const severityStyles = {
        critica: 'bg-red-500/20 text-red-400 border-red-500/30',
        alta: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        media: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        baja: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      };
      const sevClass = severityStyles[rep.severity] || severityStyles.baja;

      // Estado badge
      const statusStyles = {
        activa: 'bg-red-500/20 text-red-400',
        en_proceso: 'bg-amber-500/20 text-amber-300',
        resuelta: 'bg-emerald-500/20 text-emerald-300',
        falsa_alarma: 'bg-slate-700 text-slate-300',
      };
      const statClass = statusStyles[rep.status] || 'bg-slate-700 text-slate-300';

      // Detección de sismo y magnitud
      const isQuake = rep.incidentType === 'sismo' || Boolean(rep.sensorSnapshot?.magnitude);
      const seismicMag = rep.sensorSnapshot?.magnitude ? parseFloat(rep.sensorSnapshot.magnitude) : null;

      // Coordenadas GPS y enlace a Google Maps
      const hasCoords = rep.location?.latitude != null && rep.location?.longitude != null;
      const gmapsUrl = hasCoords ? `https://www.google.com/maps?q=${rep.location.latitude},${rep.location.longitude}` : '#';
      const coordsText = hasCoords ? `${rep.location.latitude.toFixed(4)}, ${rep.location.longitude.toFixed(4)}` : '--';

      // Evidencia preview
      let evidenceHtml = `<span class="text-slate-500 italic">Sin evidencia</span>`;
      if (rep.evidence && rep.evidence.url) {
        evidenceHtml = `
          <button class="flex items-center gap-2 group text-left hover:text-blue-400 transition" onclick="openEvidenceModal('${rep.id}')">
            <img src="${rep.evidence.url}" alt="Evidencia" class="w-9 h-9 rounded-lg object-cover border border-slate-700 group-hover:border-blue-500 shadow-sm">
            <div>
              <span class="block text-[11px] font-semibold text-slate-200 group-hover:text-blue-400">Ver Foto & Detalle</span>
              ${rep.evidence.floodDetected ? '<span class="text-[9px] text-cyan-400 font-bold">🌊 Inundación</span>' : '<span class="text-[9px] text-slate-400">Cámara Externa</span>'}
            </div>
          </button>
        `;
      } else if (isQuake) {
        evidenceHtml = `
          <button class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition group" onclick="openEvidenceModal('${rep.id}')">
            <i class="fa-solid fa-house-crack text-xs group-hover:scale-110 transition"></i>
            <span>Ver Sismo & Telemetría</span>
          </button>
        `;
      }

      // Botón resolver (solo para administradores)
      const actionHtml = currentUser && currentUser.role === 'admin' && rep.status !== 'resuelta'
        ? `<button onclick="openResolveModal('${rep.id}', '${rep.title}')" class="px-2 py-1 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded border border-emerald-500/40 text-[11px] font-semibold transition">Resolver</button>`
        : `<span class="text-slate-500 text-[11px]">${rep.status === 'resuelta' ? 'Cerrada' : 'Lectura'}</span>`;

      tr.innerHTML = `
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${sevClass}">${rep.severity}</span>
        </td>
        <td class="py-3 px-4">
          <div class="font-semibold text-slate-100">${rep.title}</div>
          <div class="text-[11px] text-slate-400 line-clamp-1">${rep.description || ''}</div>
          ${
            isQuake && seismicMag !== null
              ? `<div class="mt-1">
                   <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-sm animate-pulse">
                     <i class="fa-solid fa-gauge-high"></i>
                     <span>Magnitud del Sismo: ${seismicMag.toFixed(2)} m/s²</span>
                   </span>
                 </div>`
              : ''
          }
        </td>
        <td class="py-3 px-4 whitespace-nowrap">
          <div class="font-mono text-slate-200">${rep.hora}</div>
          <div class="text-[10px] text-slate-500">${rep.fecha}</div>
        </td>
        <td class="py-3 px-4">
          ${
            hasCoords
              ? `<a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold" title="Abrir ubicación en Google Maps">
                   <i class="fa-solid fa-map-location-dot text-red-400"></i>
                   <span>${coordsText}</span>
                   <i class="fa-solid fa-arrow-up-right-from-square text-[9px] opacity-75"></i>
                 </a>`
              : `<span class="text-slate-500 font-mono text-[11px]">--</span>`
          }
        </td>
        <td class="py-3 px-4">${evidenceHtml}</td>
        <td class="py-3 px-4 whitespace-nowrap">
          <div class="text-slate-300">${rep.device?.name || 'Sistema'}</div>
          <div class="text-[10px] text-slate-500">${rep.device?.model || ''}</div>
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${statClass}">${rep.status.replace('_', ' ')}</span>
        </td>
        <td class="py-3 px-4 text-right">${actionHtml}</td>
      `;

      tbody.appendChild(tr);
    });

    // Actualizar paginación
    const pageInfo = document.getElementById('pagination-info');
    if (pageInfo) {
      pageInfo.textContent = `Página ${data.pagination.page} de ${data.pagination.totalPages || 1} (${data.pagination.total} informes)`;
    }
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    if (prevBtn) prevBtn.disabled = data.pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = data.pagination.page >= data.pagination.totalPages;

  } catch (e) {
    console.error('Error cargando informes:', e);
  }
}
window.loadReports = loadReports;

// ============================================================================
// CARGA Y MONITOREO DE DISPOSITIVOS & HEARTBEATS
// ============================================================================
async function loadDevices() {
  const grid = document.getElementById('devices-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/devices');
    const data = await res.json();
    if (!data.success) return;

    // Actualizar simulador con los dispositivos disponibles
    if (window.setSimulatorDevices) {
      window.setSimulatorDevices(data.devices);
    }

    // Poblar selector de filtro de reportes por dispositivo
    const filterDevSelect = document.getElementById('filter-device');
    if (filterDevSelect) {
      const selectedVal = filterDevSelect.value;
      let opts = '<option value="">Todos los dispositivos</option>';
      data.devices.forEach((d) => {
        opts += `<option value="${d.id}" ${d.id === selectedVal ? 'selected' : ''}>${d.name} (${d.deviceIdentifier})</option>`;
      });
      filterDevSelect.innerHTML = opts;
    }

    const pendingContainer = document.getElementById('pending-nodes-container');
    const pendingList = document.getElementById('pending-nodes-list');
    const pendingCountEl = document.getElementById('pending-nodes-count');

    const pendingDevices = data.devices.filter((d) => d.isAuthorized === false);
    const authorizedDevices = data.devices.filter((d) => d.isAuthorized !== false);

    // Manejar sección de nodos pendientes de autorización
    if (pendingDevices.length > 0) {
      pendingContainer?.classList.remove('hidden');
      if (pendingCountEl) pendingCountEl.textContent = `${pendingDevices.length} pendiente(s)`;
      if (pendingList) {
        pendingList.innerHTML = '';
        pendingDevices.forEach((dev) => {
          pendingList.appendChild(createPendingNodeCard(dev));
        });
      }
    } else {
      pendingContainer?.classList.add('hidden');
    }

    const onlineCount = authorizedDevices.filter((d) => d.isOnline).length;
    document.getElementById('kpi-devices-online').textContent = `${onlineCount} / ${authorizedDevices.length}`;
    document.getElementById('devices-online-counter').textContent = onlineCount;

    grid.innerHTML = '';
    authorizedDevices.forEach((dev) => {
      const card = createDeviceCard(dev);
      grid.appendChild(card);

      // Actualizar marcador en el mapa
      if (window.updateDeviceMarker) {
        window.updateDeviceMarker(dev);
      }
    });
  } catch (e) {
    console.error('Error al cargar dispositivos:', e);
  }
}
window.loadDevices = loadDevices;

function createPendingNodeCard(dev) {
  const card = document.createElement('div');
  card.className = 'bg-slate-900/90 border border-amber-500/30 rounded-xl p-4 shadow-lg space-y-3';

  const isAdmin = currentUser && currentUser.role === 'admin';

  card.innerHTML = `
    <div class="flex items-start justify-between">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
          <i class="fa-solid fa-mobile-screen"></i>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white">${dev.name}</h4>
          <p class="text-[10px] text-slate-400 font-mono">${dev.model || 'Android'} &bull; ID: ${dev.deviceIdentifier}</p>
        </div>
      </div>
      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
        Pendiente
      </span>
    </div>

    <div class="text-[11px] text-slate-400">
      <span class="text-slate-500">Solicitado:</span> ${dev.authRequestedAt ? new Date(dev.authRequestedAt).toLocaleTimeString() : 'Recientemente'}
    </div>

    <div class="pt-2 border-t border-slate-800 flex items-center justify-end gap-2">
      ${
        isAdmin
          ? `
            <button onclick="rejectNode('${dev.id}', '${dev.name}')" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-red-950/40 text-slate-400 hover:text-red-300 border border-slate-700 text-xs font-semibold transition">
              Rechazar
            </button>
            <button onclick="authorizeNode('${dev.id}', '${dev.name}')" class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition flex items-center gap-1">
              <i class="fa-solid fa-check"></i>
              <span>Aprobar y Autorizar</span>
            </button>
          `
          : `<span class="text-[11px] text-slate-500 italic">Requiere login de Administrador para autorizar</span>`
      }
    </div>
  `;

  return card;
}

async function authorizeNode(deviceId, deviceName) {
  const token = localStorage.getItem('admin_jwt_token');
  if (!token) {
    alert('Debes iniciar sesión como Administrador para autorizar nodos.');
    return;
  }

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
      showToast('Nodo Autorizado', `El nodo "${deviceName}" ha sido autorizado exitosamente.`, 'success');
      loadDevices();
    } else {
      alert(data.error || 'Error al autorizar nodo.');
    }
  } catch (err) {
    alert(err.message);
  }
}
window.authorizeNode = authorizeNode;

async function rejectNode(deviceId, deviceName) {
  const token = localStorage.getItem('admin_jwt_token');
  if (!token) {
    alert('Debes iniciar sesión como Administrador para rechazar nodos.');
    return;
  }

  if (!confirm(`¿Estás seguro de rechazar la solicitud del nodo "${deviceName}"?`)) {
    return;
  }

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
      showToast('Nodo Rechazado', `El nodo "${deviceName}" fue rechazado.`, 'info');
      loadDevices();
    } else {
      alert(data.error || 'Error al rechazar nodo.');
    }
  } catch (err) {
    alert(err.message);
  }
}
window.rejectNode = rejectNode;

function createDeviceCard(dev) {
  const isOnline = dev.isOnline;
  const statusColor = isOnline ? 'emerald' : 'red';
  const battery = dev.telemetrySummary?.batteryLevel ?? 0;
  const isCharging = dev.telemetrySummary?.isCharging;
  const batteryTemp = dev.telemetrySummary?.batteryTemp ?? '--';
  const cpuTemp = dev.telemetrySummary?.cpuTemp ?? '--';

  // Coordenadas con enlace directo a Google Maps
  const hasCoords = dev.location?.latitude != null && dev.location?.longitude != null;
  const gmapsUrl = hasCoords ? `https://www.google.com/maps?q=${dev.location.latitude},${dev.location.longitude}` : '#';
  const coordsLabel = hasCoords ? `${dev.location.latitude.toFixed(4)}, ${dev.location.longitude.toFixed(4)}` : '--';

  // Sección de Última Foto Tomada del Dispositivo
  let latestPhotoHtml = '';
  if (dev.latestEvidence && dev.latestEvidence.filePath) {
    const photoUrl = dev.latestEvidence.filePath;
    const photoFilename = dev.latestEvidence.originalFilename || `foto_${dev.deviceIdentifier}.jpg`;
    const photoTime = dev.latestEvidence.capturedAt ? new Date(dev.latestEvidence.capturedAt).toLocaleString() : 'Reciente';
    const isFlood = dev.latestEvidence.floodDetected;

    latestPhotoHtml = `
      <!-- Última Foto Capturada por el Dispositivo -->
      <div class="space-y-2 pt-3 border-t border-slate-800">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-slate-300 flex items-center gap-1.5">
            <i class="fa-solid fa-camera text-blue-400"></i>
            <span>Última Foto Tomada</span>
          </span>
          <span class="text-[10px] text-slate-400 font-mono">${photoTime}</span>
        </div>

        <div class="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
          <img src="${photoUrl}" alt="Última foto de ${dev.name}" class="w-full h-40 object-cover cursor-pointer group-hover:scale-105 transition duration-300" onclick="openDeviceEvidenceModal('${dev.id}')">
          <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none"></div>
          ${isFlood ? '<span class="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-600/90 text-white border border-cyan-400/50 backdrop-blur-sm">🌊 Inundación</span>' : ''}
          <button onclick="openDeviceEvidenceModal('${dev.id}')" class="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-900 text-white text-[11px] font-semibold border border-slate-700 backdrop-blur-sm transition flex items-center gap-1.5 shadow">
            <i class="fa-solid fa-expand text-[10px]"></i>
            <span>Ampliar</span>
          </button>
        </div>

        <a href="${photoUrl}" download="${photoFilename}" target="_blank" class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-bold transition shadow-sm">
          <i class="fa-solid fa-download"></i>
          <span>Descargar Foto</span>
        </a>
      </div>
    `;
  } else {
    latestPhotoHtml = `
      <div class="pt-3 border-t border-slate-800">
        <div class="w-full py-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 flex flex-col items-center justify-center text-slate-500 text-xs gap-1">
          <i class="fa-solid fa-camera text-slate-600 text-base"></i>
          <span>Sin fotos capturadas aún</span>
        </div>
      </div>
    `;
  }

  const card = document.createElement('div');
  card.id = `device-card-${dev.id}`;
  card.className = 'bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4 hover:border-slate-700 transition flex flex-col justify-between';

  card.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            <i class="fa-solid fa-mobile-screen text-lg"></i>
          </div>
          <div>
            <h3 class="text-sm font-bold text-white">${dev.name}</h3>
            <p class="text-[11px] text-slate-400">${dev.model || 'Android'} &bull; ${dev.osVersion || 'OS'}</p>
          </div>
        </div>
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-${statusColor}-500/10 text-${statusColor}-400 border border-${statusColor}-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-${statusColor}-400 ${isOnline ? 'animate-live' : ''}"></span>
          ${isOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      <!-- Barra de Batería -->
      <div>
        <div class="flex justify-between text-xs mb-1">
          <span class="text-slate-400 flex items-center gap-1">
            <i class="fa-solid fa-battery-half"></i> Batería
            ${isCharging ? '<i class="fa-solid fa-bolt text-amber-400 ml-1" title="Cargando"></i>' : ''}
          </span>
          <span class="font-bold font-mono text-white">${battery}%</span>
        </div>
        <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
          <div class="h-full ${battery < 20 ? 'bg-red-500' : battery < 50 ? 'bg-amber-500' : 'bg-emerald-500'}" style="width: ${battery}%"></div>
        </div>
      </div>

      <!-- Indicadores de Temperatura -->
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="bg-slate-800/60 p-2.5 rounded-xl border border-slate-800">
          <span class="text-slate-400 text-[10px] block mb-0.5">Temp. Batería</span>
          <span class="font-bold font-mono text-slate-200 text-sm">${batteryTemp} °C</span>
        </div>
        <div class="bg-slate-800/60 p-2.5 rounded-xl border border-slate-800">
          <span class="text-slate-400 text-[10px] block mb-0.5">Temp. CPU</span>
          <span class="font-bold font-mono text-slate-200 text-sm">${cpuTemp} °C</span>
        </div>
      </div>

      <!-- Sección de Última Foto Tomada -->
      ${latestPhotoHtml}
    </div>

    <!-- Coordenadas GPS con Enlace a Google Maps y Última Conexión -->
    <div class="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
      ${
        hasCoords
          ? `<a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" class="font-mono text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1.5 font-bold" title="Abrir ubicación en Google Maps">
               <i class="fa-solid fa-map-location-dot text-red-400"></i>
               <span>${coordsLabel}</span>
               <i class="fa-solid fa-arrow-up-right-from-square text-[9px] opacity-75"></i>
             </a>`
          : `<span class="font-mono text-slate-500"><i class="fa-solid fa-location-dot mr-1"></i>--</span>`
      }
      <span class="italic text-[10px]">
        ${dev.secondsSinceLastSeen !== null ? `Hace ${dev.secondsSinceLastSeen}s` : 'Sin datos'}
      </span>
    </div>
  `;

  return card;
}

function updateDeviceCardHeartbeat(data) {
  const card = document.getElementById(`device-card-${data.deviceId}`);
  if (card) {
    // Si la tarjeta ya existe, recargarla para reflejar métricas
    loadDevices();
  }
}

// ============================================================================
// MODAL DE VISUALIZACIÓN DE EVIDENCIAS, SISMO Y OCR
// ============================================================================
async function openEvidenceModal(incidentId) {
  const modal = document.getElementById('evidence-modal');
  if (!modal) return;

  try {
    const res = await fetch(`/api/reports/${incidentId}`);
    const data = await res.json();
    if (!data.success || !data.report) {
      alert('Error cargando informe de incidencia.');
      return;
    }

    const report = data.report;
    const ev = report.evidence;
    const isQuake = report.incidentType === 'sismo' || Boolean(report.sensorSnapshot?.magnitude);
    const hasPhoto = Boolean(ev && ev.url);

    // Título y Subtítulo
    document.getElementById('evidence-modal-title').textContent = report.title;
    document.getElementById('evidence-modal-subtitle').textContent = `Reportado a las ${report.hora || 'N/A'} por ${report.device?.name || 'Sistema Centinela'}`;

    // Icono
    const iconBadge = document.getElementById('evidence-modal-icon-badge');
    if (iconBadge) {
      iconBadge.innerHTML = isQuake
        ? '<i class="fa-solid fa-house-crack text-amber-400 text-base"></i>'
        : '<i class="fa-solid fa-water text-cyan-400 text-base"></i>';
      iconBadge.className = isQuake
        ? 'w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center'
        : 'w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center';
    }

    // Bloque de Magnitud Sísmica Resaltada
    const seismicBox = document.getElementById('evidence-modal-seismic-box');
    if (isQuake && seismicBox) {
      seismicBox.classList.remove('hidden');
      const mag = report.sensorSnapshot?.magnitude ?? 0;
      const threshold = report.sensorSnapshot?.threshold ?? 14.5;
      document.getElementById('evidence-modal-seismic-mag').textContent = `${mag.toFixed(2)} m/s²`;
      document.getElementById('evidence-modal-seismic-threshold').textContent = threshold.toFixed(2);
      document.getElementById('evidence-modal-seismic-severity').textContent = `${report.severity} Severidad`;
      document.getElementById('evidence-modal-accel-x').textContent = report.sensorSnapshot?.accelX != null ? `${report.sensorSnapshot.accelX.toFixed(2)} m/s²` : '--';
      document.getElementById('evidence-modal-accel-y').textContent = report.sensorSnapshot?.accelY != null ? `${report.sensorSnapshot.accelY.toFixed(2)} m/s²` : '--';
      document.getElementById('evidence-modal-accel-z').textContent = report.sensorSnapshot?.accelZ != null ? `${report.sensorSnapshot.accelZ.toFixed(2)} m/s²` : '--';
    } else if (seismicBox) {
      seismicBox.classList.add('hidden');
    }

    // Imagen y Botón de Descarga
    const imgContainer = document.getElementById('evidence-modal-image-container');
    if (hasPhoto && imgContainer) {
      imgContainer.classList.remove('hidden');
      document.getElementById('evidence-modal-img').src = ev.url;
      document.getElementById('evidence-modal-filename').textContent = ev.filename || 'foto_evidencia.jpg';
      const dlBtn = document.getElementById('evidence-modal-download-btn');
      if (dlBtn) {
        dlBtn.href = ev.url;
        dlBtn.setAttribute('download', ev.filename || 'foto_evidencia.jpg');
      }
    } else if (imgContainer) {
      imgContainer.classList.add('hidden');
    }

    // Coordenadas GPS con Enlace a Google Maps
    const coordsEl = document.getElementById('evidence-modal-coords');
    const gmapsLink = document.getElementById('evidence-modal-gmaps-link');
    if (report.location?.latitude != null && report.location?.longitude != null) {
      const lat = report.location.latitude;
      const lng = report.location.longitude;
      if (coordsEl) coordsEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (gmapsLink) {
        gmapsLink.href = `https://www.google.com/maps?q=${lat},${lng}`;
      }
    } else if (gmapsLink) {
      if (coordsEl) coordsEl.textContent = 'Coordenadas no registradas';
      gmapsLink.href = '#';
    }

    // OCR / Inundación
    const ocrBox = document.getElementById('evidence-modal-ocr-box');
    if (ocrBox) {
      if (ev && (ev.floodDetected || ev.waterLevelCm || ev.ocrText || ev.ocrRawText)) {
        ocrBox.classList.remove('hidden');
        const floodBadge = document.getElementById('evidence-modal-flood-badge');
        if (floodBadge) {
          if (ev.floodDetected) {
            floodBadge.textContent = '🌊 Inundación Detectada';
            floodBadge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-600/30 text-cyan-300 border border-cyan-500/40';
          } else {
            floodBadge.textContent = 'Condición Normal';
            floodBadge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-slate-700 text-slate-300';
          }
        }
        document.getElementById('evidence-modal-water-level').textContent = ev.waterLevelCm ? `${ev.waterLevelCm} cm` : 'No aplicable';
        document.getElementById('evidence-modal-confidence').textContent = ev.floodConfidence ? `${(ev.floodConfidence * 100).toFixed(0)}%` : '--';
        document.getElementById('evidence-modal-ocr-text').textContent = ev.ocrText || ev.ocrRawText || 'Sin texto reconocido';
      } else {
        ocrBox.classList.add('hidden');
      }
    }

    modal.classList.remove('hidden');
  } catch (e) {
    console.error('Error al cargar evidencia:', e);
  }
}
window.openEvidenceModal = openEvidenceModal;

async function openDeviceEvidenceModal(deviceId) {
  const modal = document.getElementById('evidence-modal');
  if (!modal) return;

  try {
    const res = await fetch(`/api/devices/${deviceId}`);
    const data = await res.json();
    if (!data.success || !data.device) {
      alert('No se pudo obtener información del dispositivo.');
      return;
    }

    const dev = data.device;
    const ev = dev.latestEvidence;
    if (!ev) {
      alert('Este dispositivo no tiene fotos capturadas aún.');
      return;
    }

    document.getElementById('evidence-modal-title').textContent = `Última Foto: ${dev.name}`;
    document.getElementById('evidence-modal-subtitle').textContent = `Capturada a las ${ev.capturedAt ? new Date(ev.capturedAt).toLocaleTimeString() : 'N/A'} &bull; ${dev.model || 'Android'}`;

    const iconBadge = document.getElementById('evidence-modal-icon-badge');
    if (iconBadge) {
      iconBadge.innerHTML = '<i class="fa-solid fa-camera text-blue-400"></i>';
      iconBadge.className = 'w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center';
    }

    // Ocultar caja sísmica (es captura fotográfica normal del nodo)
    document.getElementById('evidence-modal-seismic-box')?.classList.add('hidden');

    // Imagen y Botón Descargar
    const imgContainer = document.getElementById('evidence-modal-image-container');
    if (imgContainer) {
      imgContainer.classList.remove('hidden');
      document.getElementById('evidence-modal-img').src = ev.filePath;
      document.getElementById('evidence-modal-filename').textContent = ev.originalFilename || 'foto.jpg';
      const dlBtn = document.getElementById('evidence-modal-download-btn');
      if (dlBtn) {
        dlBtn.href = ev.filePath;
        dlBtn.setAttribute('download', ev.originalFilename || 'foto.jpg');
      }
    }

    // Coordenadas con link a Google Maps
    const lat = ev.latitude || dev.lastLatitude;
    const lng = ev.longitude || dev.lastLongitude;
    const coordsEl = document.getElementById('evidence-modal-coords');
    const gmapsLink = document.getElementById('evidence-modal-gmaps-link');
    if (lat != null && lng != null) {
      if (coordsEl) coordsEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (gmapsLink) {
        gmapsLink.href = `https://www.google.com/maps?q=${lat},${lng}`;
      }
    } else if (gmapsLink) {
      if (coordsEl) coordsEl.textContent = 'Coordenadas no disponibles';
      gmapsLink.href = '#';
    }

    // OCR / Inundación
    const ocrBox = document.getElementById('evidence-modal-ocr-box');
    if (ocrBox) {
      if (ev.floodDetected || ev.waterLevelCm || ev.ocrRawText) {
        ocrBox.classList.remove('hidden');
        const floodBadge = document.getElementById('evidence-modal-flood-badge');
        if (floodBadge) {
          if (ev.floodDetected) {
            floodBadge.textContent = '🌊 Inundación Detectada';
            floodBadge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-600/30 text-cyan-300 border border-cyan-500/40';
          } else {
            floodBadge.textContent = 'Condición Normal';
            floodBadge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-slate-700 text-slate-300';
          }
        }
        document.getElementById('evidence-modal-water-level').textContent = ev.waterLevelCm ? `${ev.waterLevelCm} cm` : 'No aplicable';
        document.getElementById('evidence-modal-confidence').textContent = ev.floodConfidence ? `${(ev.floodConfidence * 100).toFixed(0)}%` : '--';
        document.getElementById('evidence-modal-ocr-text').textContent = ev.ocrRawText || 'Sin texto reconocido';
      } else {
        ocrBox.classList.add('hidden');
      }
    }

    modal.classList.remove('hidden');
  } catch (e) {
    console.error('Error al abrir modal de evidencia del dispositivo:', e);
  }
window.openDeviceEvidenceModal = openDeviceEvidenceModal;

// ============================================================================
// MODAL DE RESOLUCIÓN DE INCIDENCIA (Solo Administrador)
// ============================================================================
function openResolveModal(incidentId, title) {
  const modal = document.getElementById('resolve-modal');
  if (!modal) return;

  document.getElementById('resolve-incident-id').value = incidentId;
  document.getElementById('resolve-incident-title').textContent = title;
  document.getElementById('resolve-notes').value = '';
  modal.classList.remove('hidden');
}
window.openResolveModal = openResolveModal;

// ============================================================================
// AUTENTICACIÓN ADMIN Y SESIÓN
// ============================================================================
async function checkAuthSession() {
  const token = localStorage.getItem('admin_jwt_token');
  if (!token) {
    setGuestMode();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success && data.user) {
      setAdminMode(data.user);
    } else {
      localStorage.removeItem('admin_jwt_token');
      setGuestMode();
    }
  } catch (e) {
    setGuestMode();
  }
}

function setAdminMode(user) {
  currentUser = user;
  document.getElementById('guest-badge')?.classList.add('hidden');
  document.getElementById('login-open-btn')?.classList.add('hidden');
  document.getElementById('admin-logged-box')?.classList.remove('hidden');
  document.getElementById('admin-user-name').textContent = user.name || 'Admin';

  // Mostrar todos los controles y pestañas exclusivas de administrador
  document.querySelectorAll('.admin-only').forEach((el) => el.classList.remove('hidden'));

  loadReports(currentReportsPage);
  loadAdminUsers();
  loadAuditLogs();
}

function setGuestMode() {
  currentUser = null;
  document.getElementById('guest-badge')?.classList.remove('hidden');
  document.getElementById('login-open-btn')?.classList.remove('hidden');
  document.getElementById('admin-logged-box')?.classList.add('hidden');

  // Ocultar todos los controles y pestañas exclusivas de administrador
  document.querySelectorAll('.admin-only').forEach((el) => el.classList.add('hidden'));

  // Si el usuario estaba en una pestaña restringida de admin, regresar a vista de mapa público
  const activeTabContent = document.querySelector('.tab-content:not(.hidden)');
  if (activeTabContent && activeTabContent.classList.contains('admin-only')) {
    switchTab('tab-map');
  }

  loadReports(currentReportsPage);
}

// ============================================================================
// GESTIÓN Y AUTORIZACIÓN DE ADMINISTRADORES (Solo Admin)
// ============================================================================
async function loadAdminUsers() {
  const token = localStorage.getItem('admin_jwt_token');
  if (!token) return;

  try {
    const res = await fetch('/api/auth/admin-users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.success) return;

    const pendingAdmins = data.users.filter((u) => u.isApproved === false);
    const approvedAdmins = data.users.filter((u) => u.isApproved !== false);

    // Contadores en pestañas y tarjetas
    const pendingCounterNav = document.getElementById('pending-admins-counter');
    const pendingBadge = document.getElementById('pending-admins-badge');
    if (pendingCounterNav) {
      if (pendingAdmins.length > 0) {
        pendingCounterNav.textContent = pendingAdmins.length;
        pendingCounterNav.classList.remove('hidden');
      } else {
        pendingCounterNav.classList.add('hidden');
      }
    }
    if (pendingBadge) {
      pendingBadge.textContent = `${pendingAdmins.length} pendiente(s)`;
    }

    const activeCountEl = document.getElementById('active-admins-count');
    if (activeCountEl) {
      activeCountEl.textContent = `${approvedAdmins.length} admin(s) activo(s)`;
    }

    // Renderizar solicitudes pendientes
    const pendingList = document.getElementById('pending-admins-list');
    if (pendingList) {
      if (pendingAdmins.length === 0) {
        pendingList.innerHTML = `<div class="text-slate-500 text-xs py-4 col-span-full text-center">No hay solicitudes de administrador pendientes.</div>`;
      } else {
        pendingList.innerHTML = '';
        pendingAdmins.forEach((adm) => {
          const card = document.createElement('div');
          card.className = 'bg-slate-900 border border-amber-500/40 rounded-xl p-4 shadow-lg space-y-3';
          card.innerHTML = `
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  <i class="fa-solid fa-user-shield"></i>
                </div>
                <div>
                  <h4 class="text-xs font-bold text-white">${adm.name}</h4>
                  <p class="text-[10px] text-slate-400 font-mono">${adm.email}</p>
                </div>
              </div>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Pendiente</span>
            </div>
            <div class="text-[11px] text-slate-400">
              <span class="text-slate-500">Registrado:</span> ${new Date(adm.createdAt).toLocaleString()}
            </div>
            <div class="pt-2 border-t border-slate-800 flex items-center justify-end gap-2">
              <button onclick="rejectAdminUser('${adm.id}', '${adm.name}')" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-red-950/40 text-slate-400 hover:text-red-300 border border-slate-700 text-xs font-semibold transition cursor-pointer">
                Rechazar
              </button>
              <button onclick="approveAdminUser('${adm.id}', '${adm.name}')" class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition flex items-center gap-1 cursor-pointer">
                <i class="fa-solid fa-check"></i>
                <span>Autorizar Admin</span>
              </button>
            </div>
          `;
          pendingList.appendChild(card);
        });
      }
    }

    // Renderizar administradores aprobados
    const approvedTbody = document.getElementById('approved-admins-table-body');
    if (approvedTbody) {
      if (approvedAdmins.length === 0) {
        approvedTbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-slate-500">No hay administradores registrados.</td></tr>`;
      } else {
        approvedTbody.innerHTML = '';
        approvedAdmins.forEach((adm) => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-slate-800/40 transition';
          tr.innerHTML = `
            <td class="py-2.5 px-3 font-semibold text-white">${adm.name}</td>
            <td class="py-2.5 px-3 font-mono text-slate-300">${adm.email}</td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                ${adm.role}
              </span>
            </td>
            <td class="py-2.5 px-3">
              <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                <i class="fa-solid fa-circle-check text-[10px]"></i> Aprobado
              </span>
            </td>
            <td class="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
              ${adm.approvedAt ? new Date(adm.approvedAt).toLocaleString() : (adm.createdAt ? new Date(adm.createdAt).toLocaleString() : 'N/A')}
            </td>
          `;
          approvedTbody.appendChild(tr);
        });
      }
    }
  } catch (err) {
    console.error('Error al cargar administradores:', err);
  }
}
window.loadAdminUsers = loadAdminUsers;

async function approveAdminUser(userId, userName) {
  const token = localStorage.getItem('admin_jwt_token');
  if (!token) return;

  try {
    const res = await fetch(`/api/auth/admin-users/${userId}/approve`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    if (data.success) {
      showToast('Administrador Autorizado', `Se ha aprobado el acceso para "${userName}".`, 'success');
      loadAdminUsers();
      loadAuditLogs();
    } else {
      alert(data.error || 'Error al aprobar administrador.');
    }
  } catch (e) {
    alert(e.message);
  }
}
window.approveAdminUser = approveAdminUser;

async function rejectAdminUser(userId, userName) {
  const token = localStorage.getItem('admin_jwt_token');
  if (!token) return;

  if (!confirm(`¿Estás seguro de rechazar la solicitud de administrador de "${userName}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/auth/admin-users/${userId}/reject`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    if (data.success) {
      showToast('Solicitud Rechazada', `La solicitud de "${userName}" fue rechazada.`, 'info');
      loadAdminUsers();
      loadAuditLogs();
    } else {
      alert(data.error || 'Error al rechazar solicitud.');
    }
  } catch (e) {
    alert(e.message);
  }
}
window.rejectAdminUser = rejectAdminUser;

// ============================================================================
// REGISTRO DE AUDITORÍA DEL SISTEMA (Audit Log)
// ============================================================================
async function loadAuditLogs() {
  const token = localStorage.getItem('admin_jwt_token');
  if (!token) return;

  const category = document.getElementById('audit-filter-category')?.value || '';
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;

  const queryParams = new URLSearchParams({ limit: '60' });
  if (category) queryParams.set('category', category);

  try {
    const res = await fetch(`/api/auth/audit-logs?${queryParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.success) return;

    if (data.logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-500 font-sans text-xs">No hay registros de auditoría que coincidan con el filtro.</td></tr>`;
      return;
    }

    const categoryColors = {
      auth: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      devices: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      camera: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      incidents: 'bg-red-500/20 text-red-300 border-red-500/30',
      system: 'bg-slate-700 text-slate-300 border-slate-600',
    };

    const severityColors = {
      info: 'text-slate-400',
      warning: 'text-amber-400 font-bold',
      critical: 'text-red-400 font-bold animate-pulse',
      error: 'text-red-500 font-bold',
    };

    tbody.innerHTML = '';
    data.logs.forEach((log) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition';

      const catBadge = categoryColors[log.category] || categoryColors.system;
      const sevColor = severityColors[log.severity] || severityColors.info;
      const dateStr = new Date(log.createdAt).toLocaleString();

      // Miniatura si contiene foto en metadata
      let metaDetails = '';
      if (log.metadata && log.metadata.filePath) {
        metaDetails = `
          <div class="mt-1 flex items-center gap-2">
            <a href="${log.metadata.filePath}" target="_blank" class="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 hover:underline">
              <i class="fa-solid fa-camera"></i>
              <span>Ver Foto (${log.metadata.filename || 'captura'})</span>
            </a>
            ${log.metadata.prunedCount ? `<span class="text-[10px] text-slate-500">(${log.metadata.prunedCount} fotos antiguas depuradas)</span>` : ''}
          </div>
        `;
      }

      tr.innerHTML = `
        <td class="py-2 px-3 text-slate-400 whitespace-nowrap">${dateStr}</td>
        <td class="py-2 px-3 whitespace-nowrap">
          <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${catBadge}">
            ${log.category}
          </span>
        </td>
        <td class="py-2 px-3 font-semibold text-slate-200 whitespace-nowrap font-mono">${log.action}</td>
        <td class="py-2 px-3 uppercase text-[10px] ${sevColor} whitespace-nowrap">${log.severity}</td>
        <td class="py-2 px-3 font-sans text-xs text-slate-300">
          <div>${log.description}</div>
          ${metaDetails}
        </td>
      `;

      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error al cargar logs de auditoría:', err);
  }
}
window.loadAuditLogs = loadAuditLogs;

// ============================================================================
// NAVEGACIÓN POR PESTAÑAS
// ============================================================================
function switchTab(targetTabId) {
  document.querySelectorAll('.tab-content').forEach((sec) => sec.classList.add('hidden'));
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.remove('active-tab', 'bg-blue-600', 'text-white', 'shadow-sm');
    btn.classList.add('text-slate-400');
  });

  const activeSection = document.getElementById(targetTabId);
  if (activeSection) activeSection.classList.remove('hidden');

  const activeBtn = document.querySelector(`[data-tab="${targetTabId}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active-tab', 'bg-blue-600', 'text-white', 'shadow-sm');
    activeBtn.classList.remove('text-slate-400');
  }

  // Refrescar tamaño del mapa si se abre la pestaña de mapa
  if (targetTabId === 'tab-map' && window.mapInstance) {
    setTimeout(() => window.mapInstance.invalidateSize(), 200);
  }
}
window.switchTab = switchTab;

// ============================================================================
// EVENT LISTENERS DOMContentLoaded
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Inicializar mapa
  if (window.initLiveMap) window.initLiveMap();

  // 2. Inicializar WebSockets
  initSocket();

  // 3. Inicializar simulador
  if (window.initSimulator) window.initSimulator();

  // 4. Verificar sesión de administrador o modo usuario regular
  checkAuthSession();

  // 5. Cargar datos iniciales
  loadStats();
  loadActiveAlerts();
  loadDevices();
  loadReports(1);

  // 6. Tabs
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      switchTab(target);
    });
  });

  // 7. Filtros de informes
  document.getElementById('apply-filters-btn')?.addEventListener('click', () => loadReports(1));
  document.getElementById('filter-device')?.addEventListener('change', () => loadReports(1));
  document.getElementById('prev-page-btn')?.addEventListener('click', () => {
    if (currentReportsPage > 1) loadReports(currentReportsPage - 1);
  });
  document.getElementById('next-page-btn')?.addEventListener('click', () => {
    loadReports(currentReportsPage + 1);
  });

  // Exportar CSV (Solo Admin)
  document.getElementById('export-csv-btn')?.addEventListener('click', () => {
    const token = localStorage.getItem('admin_jwt_token');
    if (!token) {
      alert('Se requiere iniciar sesión como administrador para exportar informes.');
      return;
    }
    window.location.href = `/api/reports/export/csv?token=${encodeURIComponent(token)}`;
  });

  // 8. Botón actualizar dispositivos
  document.getElementById('refresh-devices-btn')?.addEventListener('click', loadDevices);

  // 8.1 Botones de Panel Admin y Auditoría
  document.getElementById('refresh-admin-panel-btn')?.addEventListener('click', () => {
    loadAdminUsers();
    loadAuditLogs();
    showToast('Panel Actualizado', 'Información de administradores y auditoría refrescada.', 'info');
  });
  document.getElementById('refresh-audit-btn')?.addEventListener('click', loadAuditLogs);
  document.getElementById('audit-filter-category')?.addEventListener('change', loadAuditLogs);

  // 9. Alternar audio
  document.getElementById('toggle-audio-btn')?.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    const icon = document.getElementById('audio-icon');
    if (icon) {
      icon.className = audioEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark text-slate-500';
    }
    showToast('Configuración de Audio', audioEnabled ? 'Sonidos de alerta activados.' : 'Sonidos silenciados.', 'info');
  });

  // 10. Descartar banner crítico
  document.getElementById('banner-dismiss-btn')?.addEventListener('click', () => {
    document.getElementById('critical-alert-banner')?.classList.add('hidden');
  });

  // 11. Modal Login / Registro
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-admin-form');
  const modalTitle = document.getElementById('auth-modal-title');
  const modalSubtitle = document.getElementById('auth-modal-subtitle');

  document.getElementById('login-open-btn')?.addEventListener('click', () => {
    loginForm?.classList.remove('hidden');
    regForm?.classList.add('hidden');
    if (modalTitle) modalTitle.textContent = 'Acceso Administrador';
    if (modalSubtitle) modalSubtitle.textContent = 'Ingreso exclusivo para operadores de emergencia';
    document.getElementById('login-error-msg')?.classList.add('hidden');
    document.getElementById('reg-status-msg')?.classList.add('hidden');
    document.getElementById('login-modal')?.classList.remove('hidden');
  });

  document.getElementById('login-close-btn')?.addEventListener('click', () => {
    document.getElementById('login-modal')?.classList.add('hidden');
  });

  document.getElementById('switch-to-register-btn')?.addEventListener('click', () => {
    loginForm?.classList.add('hidden');
    regForm?.classList.remove('hidden');
    if (modalTitle) modalTitle.textContent = 'Solicitud de Administrador';
    if (modalSubtitle) modalSubtitle.textContent = 'Registro de operadores (requiere aprobación de un admin activo)';
    document.getElementById('reg-status-msg')?.classList.add('hidden');
  });

  document.getElementById('switch-to-login-btn')?.addEventListener('click', () => {
    regForm?.classList.add('hidden');
    loginForm?.classList.remove('hidden');
    if (modalTitle) modalTitle.textContent = 'Acceso Administrador';
    if (modalSubtitle) modalSubtitle.textContent = 'Ingreso exclusivo para operadores de emergencia';
    document.getElementById('login-error-msg')?.classList.add('hidden');
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error-msg');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (data.success && data.token) {
        localStorage.setItem('admin_jwt_token', data.token);
        setAdminMode(data.user);
        document.getElementById('login-modal')?.classList.add('hidden');
        showToast('Bienvenido', `Sesión iniciada como Administrador: ${data.user.name}`, 'success');
      } else {
        errorEl.textContent = data.error || 'Credenciales incorrectas.';
        errorEl.classList.remove('hidden');
      }
    } catch (err) {
      errorEl.textContent = 'Error al conectar con el servidor.';
      errorEl.classList.remove('hidden');
    }
  });

  // Registro de Administrador Form Submission
  regForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const statusEl = document.getElementById('reg-status-msg');

    statusEl.className = 'text-xs p-2.5 rounded-lg border bg-blue-950/40 text-blue-300 border-blue-800/40';
    statusEl.textContent = 'Enviando solicitud de registro...';
    statusEl.classList.remove('hidden');

    try {
      const res = await fetch('/api/auth/register-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();

      if (data.success) {
        statusEl.className = 'text-xs p-2.5 rounded-lg border bg-emerald-950/40 text-emerald-300 border-emerald-800/40';
        statusEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> ${data.message}`;
        regForm.reset();
        setTimeout(() => {
          regForm?.classList.add('hidden');
          loginForm?.classList.remove('hidden');
          if (modalTitle) modalTitle.textContent = 'Acceso Administrador';
          if (modalSubtitle) modalSubtitle.textContent = 'Ingreso exclusivo para operadores de emergencia';
          showToast('Registro Solicitado', 'Tu solicitud fue enviada y será revisada por un administrador.', 'success');
        }, 3000);
      } else {
        statusEl.className = 'text-xs p-2.5 rounded-lg border bg-red-950/40 text-red-400 border-red-800/40';
        statusEl.textContent = data.error || 'Error al enviar la solicitud de registro.';
      }
    } catch (err) {
      statusEl.className = 'text-xs p-2.5 rounded-lg border bg-red-950/40 text-red-400 border-red-800/40';
      statusEl.textContent = 'Error al conectar con el servidor.';
    }
  });

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('admin_jwt_token');
    setGuestMode();
    showToast('Sesión Finalizada', 'Has vuelto al modo de Acceso Público Regular.', 'info');
  });

  // 12. Modal Evidencia Close
  document.getElementById('evidence-close-btn')?.addEventListener('click', () => {
    document.getElementById('evidence-modal')?.classList.add('hidden');
  });

  // 13. Modal Resolver Incidencia
  document.getElementById('resolve-close-btn')?.addEventListener('click', () => {
    document.getElementById('resolve-modal')?.classList.add('hidden');
  });

  document.getElementById('resolve-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('resolve-incident-id').value;
    const status = document.getElementById('resolve-status-select').value;
    const notes = document.getElementById('resolve-notes').value;
    const token = localStorage.getItem('admin_jwt_token');

    try {
      const res = await fetch(`/api/reports/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, resolutionNotes: notes }),
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('resolve-modal')?.classList.add('hidden');
        showToast('Incidencia Actualizada', data.message, 'success');
        loadReports(currentReportsPage);
        loadStats();
      } else {
        alert(data.error || 'Error al actualizar.');
      }
    } catch (err) {
      alert(err.message);
    }
  });

  // Intervalo de sondeo suave para mantener el contador de tiempo de los heartbeats
  setInterval(loadDevices, 15000);
});

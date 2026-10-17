import { useEffect, useRef } from 'react';
import L from 'leaflet';

export default function TacticalMap({
  incidents = [],
  devices = [],
  onSelectIncident,
  onSelectDevice,
  centerCoords = null,
  selectedIncidentId = null
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const markersMapRef = useRef(new Map());
  const activePopupIdRef = useRef(null);
  const isReconcilingRef = useRef(false);

  // 1. Inicializar mapa con OpenStreetMap (100% libre, sin requerir API keys ni suscripción)
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [10.1367, -64.6860], // Barcelona, Anzoátegui, Venezuela por defecto
      zoom: 12,
      zoomControl: false,
      closePopupOnClick: false, // La ventanita popup no se cerrará al hacer clic en el mapa
    });

    // Control de zoom en esquina superior derecha
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Servidor de Tiles de OpenStreetMap (Global, Gratuito, Confiable)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Centrar mapa y desplegar popup automáticamente si cambian las coordenadas solicitadas
  useEffect(() => {
    if (!mapInstanceRef.current || !centerCoords) return;
    const { lat, lng, alertId } = centerCoords;
    if (lat != null && lng != null) {
      mapInstanceRef.current.panTo([lat, lng], { animate: true, duration: 0.8 });

      // Si se indicó un ID de alerta, abrir y persistir su popup automáticamente
      const targetId = alertId || selectedIncidentId;
      if (targetId) {
        activePopupIdRef.current = targetId;
        setTimeout(() => {
          if (markersMapRef.current.has(targetId)) {
            markersMapRef.current.get(targetId)?.openPopup();
          }
        }, 300);
      }
    }
  }, [centerCoords, selectedIncidentId]);

  // Funciones auxiliares para generar el HTML de los popups
  const formatIncidentTime = (inc) => {
    const rawDate = inc.detectedAt || inc.createdAt || inc.timestamp || (inc.fecha && inc.hora ? `${inc.fecha} ${inc.hora}` : null);
    let timeDisplay = inc.hora || '';
    let dateDisplay = inc.fecha || '';
    if (rawDate) {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          timeDisplay = d.toLocaleTimeString('es-VE', {
            timeZone: 'America/Caracas',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          });
          dateDisplay = d.toLocaleDateString('es-VE', {
            timeZone: 'America/Caracas',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          });
        }
      } catch {
        // Fallback
      }
    }
    return timeDisplay ? `${timeDisplay} (${dateDisplay || 'Hoy'})` : 'Reciente';
  };

  const buildDevicePopupContent = (dev, isOnline, battery, lat, lng) => `
    <div style="font-family: monospace; font-size: 11px; min-width: 190px; color: #f8fafc;">
      <div style="font-weight: 800; font-size: 13px; color: #38bdf8; margin-bottom: 2px;">${dev.name}</div>
      <div style="color: #94a3b8; font-size: 10px; margin-bottom: 6px;">ID: ${dev.deviceIdentifier || 'N/A'}</div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
        <span>ESTADO:</span>
        <strong style="color: ${isOnline ? '#34d399' : '#f87171'};">${isOnline ? 'ONLINE' : 'OFFLINE'}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
        <span>BATERÍA:</span>
        <strong>${battery}%</strong>
      </div>
      <div style="color: #94a3b8; font-size: 10px; margin-top: 5px; border-top: 1px solid #334155; padding-top: 3px;">
        GPS: ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}
      </div>
    </div>
  `;

  const buildIncidentPopupContent = (inc, lat, lng) => {
    const isQuake = inc.incidentType === 'sismo' || inc.sensorSnapshot?.magnitude;
    const mag = inc.sensorSnapshot?.magnitude || inc.magnitude;
    const registrationDisplay = formatIncidentTime(inc);

    return `
      <div style="font-family: monospace; font-size: 11px; min-width: 220px; color: #f8fafc; padding: 2px;">
        <div style="font-weight: 800; font-size: 13px; color: ${isQuake ? '#f87171' : '#38bdf8'}; margin-bottom: 4px;">
          ${inc.title || 'Alerta de Emergencia'}
        </div>
        <div style="color: #38bdf8; font-size: 10px; font-weight: 700; margin-bottom: 5px; background: rgba(56, 189, 248, 0.1); padding: 3px 6px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.2);">
          🕒 Registrado: ${registrationDisplay} [HLV]
        </div>
        <div style="display: flex; gap: 4px; margin-bottom: 6px;">
          <span style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 9px; text-transform: uppercase;">
            ${inc.severity}
          </span>
          <span style="background: rgba(148, 163, 184, 0.2); color: #cbd5e1; padding: 2px 6px; border-radius: 4px; font-size: 9px; text-transform: uppercase;">
            ${inc.status}
          </span>
        </div>
        <p style="margin: 4px 0 6px 0; color: #cbd5e1; font-size: 11px; line-height: 1.35;">${inc.description || ''}</p>
        ${mag ? `<div style="font-weight: 800; color: #fbbf24; margin-bottom: 4px;">⚡ Magnitud: ${mag} m/s²</div>` : ''}
        <div style="color: #94a3b8; font-size: 10px; border-top: 1px solid #334155; padding-top: 4px; display: flex; justify-content: space-between;">
          <span>GPS: ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}</span>
          <span style="color: #38bdf8;">SENTINEL</span>
        </div>
      </div>
    `;
  };

  // 3. Actualizar marcadores de incidentes y dispositivos sin destruir capas
  // para que los popups abiertos permanezcan abiertos indefinidamente
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    const layer = markersLayerRef.current;
    const currentKeys = new Set();
    isReconcilingRef.current = true;

    // 1. Marcadores de Dispositivos Móviles Centinela
    devices.forEach((dev) => {
      const lat = dev.location?.latitude || dev.lastLatitude;
      const lng = dev.location?.longitude || dev.lastLongitude;
      if (lat == null || lng == null) return;

      const isOnline = dev.isOnline;
      const battery = dev.telemetrySummary?.batteryLevel ?? (dev.batteryLevel ?? 0);
      const key = `dev-${dev.id || dev.deviceIdentifier}`;
      currentKeys.add(key);

      const deviceIconHtml = `
        <div class="relative flex items-center justify-center cursor-pointer group">
          <span class="absolute w-8 h-8 rounded-full ${isOnline ? 'bg-emerald-500/20 animate-ping' : 'bg-slate-700/20'}"></span>
          <div class="w-7 h-7 rounded-lg ${isOnline ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'} border-2 border-slate-900 shadow-xl flex items-center justify-center text-xs font-bold transition transform group-hover:scale-110">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
          </div>
          <span class="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 ring-2 ring-slate-950' : 'bg-red-500 ring-2 ring-slate-950'}"></span>
        </div>
      `;

      const deviceIcon = L.divIcon({
        className: 'custom-device-marker',
        html: deviceIconHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const popupHtml = buildDevicePopupContent(dev, isOnline, battery, lat, lng);

      if (markersMapRef.current.has(key)) {
        // Actualizar marcador existente in-situ sin cerrar popup
        const existing = markersMapRef.current.get(key);
        existing.setLatLng([lat, lng]);
        // Solo actualizar icono si cambió y el popup no está abierto (evita que Leaflet cierre el popup)
        if (existing._iconHtml !== deviceIconHtml && !existing.isPopupOpen()) {
          existing.setIcon(deviceIcon);
          existing._iconHtml = deviceIconHtml;
        }
        if (existing._popupHtml !== popupHtml) {
          existing.setPopupContent(popupHtml);
          existing._popupHtml = popupHtml;
        }
      } else {
        // Crear nuevo marcador
        const marker = L.marker([lat, lng], { icon: deviceIcon });
        marker._iconHtml = deviceIconHtml;
        marker._popupHtml = popupHtml;
        marker.bindPopup(popupHtml, {
          autoClose: false,
          closeOnClick: false,
          closeButton: true,
          autoPan: false,
        });

        marker.on('click', () => {
          activePopupIdRef.current = dev.id || key;
          marker.openPopup();
          if (onSelectDevice) onSelectDevice(dev);
        });

        marker.on('popupopen', () => {
          activePopupIdRef.current = dev.id || key;
        });

        marker.on('popupclose', () => {
          if (!isReconcilingRef.current && (activePopupIdRef.current === dev.id || activePopupIdRef.current === key)) {
            activePopupIdRef.current = null;
          }
        });

        layer.addLayer(marker);
        markersMapRef.current.set(key, marker);
        if (dev.id) {
          markersMapRef.current.set(dev.id, marker);
        }
      }
    });

    // 2. Marcadores de Incidentes en Vivo
    incidents.forEach((inc) => {
      const lat = inc.location?.latitude ?? inc.latitude;
      const lng = inc.location?.longitude ?? inc.longitude;
      if (lat == null || lng == null) return;

      const isQuake = inc.incidentType === 'sismo' || inc.sensorSnapshot?.magnitude;
      const isFlood = inc.incidentType === 'inundacion';
      const isCritical = inc.severity === 'critica' || inc.severity === 'alta';

      const pulseColor = isQuake ? 'bg-red-600' : isFlood ? 'bg-cyan-500' : 'bg-amber-500';
      const borderColor = isQuake ? 'border-red-500' : isFlood ? 'border-cyan-400' : 'border-amber-400';

      const incidentIconHtml = `
        <div class="relative flex items-center justify-center cursor-pointer group">
          ${isCritical ? `<span class="absolute w-12 h-12 rounded-full ${pulseColor}/30 animate-ping"></span>` : ''}
          <span class="absolute w-8 h-8 rounded-full ${pulseColor}/40"></span>
          <div class="w-8 h-8 rounded-full ${pulseColor} text-white border-2 ${borderColor} shadow-2xl flex items-center justify-center text-xs font-black transition transform group-hover:scale-125">
            ${isQuake ? '⚠️' : isFlood ? '🌊' : '⚡'}
          </div>
        </div>
      `;

      const incidentIcon = L.divIcon({
        className: 'custom-incident-marker',
        html: incidentIconHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const popupHtml = buildIncidentPopupContent(inc, lat, lng);
      const key = `inc-${inc.id}`;
      currentKeys.add(key);

      if (markersMapRef.current.has(key)) {
        // Actualizar posición y contenido del popup sin destruirlo
        const existing = markersMapRef.current.get(key);
        existing.setLatLng([lat, lng]);
        if (existing._iconHtml !== incidentIconHtml && !existing.isPopupOpen()) {
          existing.setIcon(incidentIcon);
          existing._iconHtml = incidentIconHtml;
        }
        if (existing._popupHtml !== popupHtml) {
          existing.setPopupContent(popupHtml);
          existing._popupHtml = popupHtml;
        }
      } else {
        const marker = L.marker([lat, lng], { icon: incidentIcon });
        marker._iconHtml = incidentIconHtml;
        marker._popupHtml = popupHtml;
        marker.bindPopup(popupHtml, {
          autoClose: false,
          closeOnClick: false,
          closeButton: true,
          autoPan: false,
        });

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          activePopupIdRef.current = inc.id || key;
          marker.openPopup();
          if (onSelectIncident) {
            onSelectIncident(inc);
          }
        });

        marker.on('popupopen', () => {
          activePopupIdRef.current = inc.id || key;
        });

        marker.on('popupclose', () => {
          // Solo limpiar si no se está refrescando datos automáticamente
          if (!isReconcilingRef.current && (activePopupIdRef.current === inc.id || activePopupIdRef.current === key)) {
            activePopupIdRef.current = null;
          }
        });

        layer.addLayer(marker);
        markersMapRef.current.set(key, marker);
        if (inc.id) {
          markersMapRef.current.set(inc.id, marker);
        }
      }
    });

    // Eliminar marcadores obsoletos que ya no existan en la lista de datos
    for (const [key, marker] of markersMapRef.current.entries()) {
      if (key.startsWith('dev-') || key.startsWith('inc-')) {
        if (!currentKeys.has(key)) {
          layer.removeLayer(marker);
          markersMapRef.current.delete(key);
        }
      }
    }

    // Si había un popup activo, asegurar que siga visible
    if (activePopupIdRef.current) {
      const activeMarker = markersMapRef.current.get(`inc-${activePopupIdRef.current}`) ||
                           markersMapRef.current.get(`dev-${activePopupIdRef.current}`) ||
                           markersMapRef.current.get(activePopupIdRef.current) ||
                           markersMapRef.current.get(String(activePopupIdRef.current));
      if (activeMarker && !activeMarker.isPopupOpen()) {
        activeMarker.openPopup();
      }
    }

    isReconcilingRef.current = false;
  }, [incidents, devices, onSelectIncident, onSelectDevice]);

  return (
    <div className="relative z-0 isolate w-full h-[540px] rounded-2xl overflow-hidden border border-slate-800 bg-[#06090e] shadow-2xl tactical-map-layer">
      {/* Visual HUD overlay de Sentinel */}
      <div className="absolute top-3 left-3 z-[400] pointer-events-none flex flex-col gap-1.5">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 backdrop-blur-md shadow-lg">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          <span className="font-mono text-[11px] font-bold tracking-wider text-slate-200 uppercase">
            SENTINEL RADAR TÁCTICO &bull; OPENSTREETMAP
          </span>
        </div>
        <div className="font-mono text-[10px] text-slate-400 px-3 py-1 bg-slate-950/80 rounded border border-slate-800/80 backdrop-blur-sm self-start">
          Nodos detectados: <strong className="text-emerald-400 font-bold">{devices.filter(d => d.isOnline).length}</strong> / {devices.length} &bull; Incidentes activos: <strong className="text-red-400 font-bold">{incidents.filter(i => i.status === 'activa').length}</strong>
        </div>
      </div>

      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
}

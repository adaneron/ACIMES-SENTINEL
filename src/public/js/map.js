/**
 * Módulo de Visualización de Mapa en Tiempo Real con Leaflet.js
 */

let mapInstance = null;
const deviceMarkers = new Map();
const incidentMarkers = new Map();

/**
 * Inicializa el mapa centrado en la zona de operaciones
 */
function initLiveMap() {
  const defaultLat = -33.4489;
  const defaultLng = -70.6693;

  mapInstance = L.map('live-map', {
    zoomControl: true,
  }).setView([defaultLat, defaultLng], 7);

  // CartoDB Dark Matter tiles (elegante tema oscuro)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(mapInstance);

  console.log('🗺️ Mapa Leaflet inicializado.');
}

/**
 * Actualiza o agrega un marcador de dispositivo móvil en el mapa
 * @param {object} device
 */
function updateDeviceMarker(device) {
  if (!mapInstance || !device.location || device.location.latitude === null || device.location.longitude === null) {
    return;
  }

  const { latitude, longitude } = device.location;
  const isOnline = device.isOnline;
  const markerColor = isOnline ? '#10b981' : '#ef4444';

  const customIcon = L.divIcon({
    className: 'custom-device-marker',
    html: `
      <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background-color: ${markerColor}20; border: 2px solid ${markerColor}; ${isOnline ? 'animation: pulse 2s infinite;' : ''}"></div>
        <i class="fa-solid fa-mobile-screen" style="color: ${markerColor}; font-size: 13px; z-index: 2;"></i>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  const gmapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
  const popupContent = `
    <div style="font-size: 12px; line-height: 1.4;">
      <strong style="color: #60a5fa; font-size: 13px;">${device.name}</strong><br/>
      <span style="color: #94a3b8;">${device.model || 'Android'}</span><br/>
      <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #334155;">
        <span>Estado: <strong style="color: ${isOnline ? '#34d399' : '#f87171'}">${isOnline ? 'ONLINE' : 'OFFLINE'}</strong></span><br/>
        <span>Batería: <strong>${device.telemetrySummary?.batteryLevel ?? '--'}%</strong> ${device.telemetrySummary?.isCharging ? '⚡' : ''}</span><br/>
        <span>Temp: <strong>${device.telemetrySummary?.batteryTemp ?? '--'}°C</strong></span><br/>
        <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" style="color: #60a5fa; text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin-top: 6px;">
          <i class="fa-solid fa-map-location-dot"></i> Abrir en Google Maps &rarr;
        </a>
      </div>
    </div>
  `;

  if (deviceMarkers.has(device.id)) {
    const marker = deviceMarkers.get(device.id);
    marker.setLatLng([latitude, longitude]);
    marker.setIcon(customIcon);
    marker.getPopup().setContent(popupContent);
  } else {
    const marker = L.marker([latitude, longitude], { icon: customIcon })
      .bindPopup(popupContent)
      .addTo(mapInstance);
    deviceMarkers.set(device.id, marker);
  }
}

/**
 * Agrega o actualiza un marcador de incidencia (sismo o inundación) con onda expansiva
 * @param {object} incident
 */
function addIncidentMarker(incident) {
  if (!mapInstance || !incident.latitude || !incident.longitude) return;

  const isQuake = incident.incidentType === 'sismo';
  const pulseClass = isQuake ? 'seismic-pulse' : 'flood-pulse';
  const iconClass = isQuake ? 'fa-triangle-exclamation' : 'fa-water';
  const iconColor = isQuake ? '#ef4444' : '#06b6d4';

  const incidentIcon = L.divIcon({
    className: 'custom-incident-marker',
    html: `
      <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
        <div class="${pulseClass}"></div>
        <div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${iconColor}; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 12px ${iconColor}; z-index: 3;">
          <i class="fa-solid ${iconClass}" style="color: white; font-size: 11px;"></i>
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

  const gmapsUrl = `https://www.google.com/maps?q=${incident.latitude},${incident.longitude}`;
  const popupContent = `
    <div style="font-size: 12px; line-height: 1.4;">
      <div style="display: flex; gap: 4px; margin-bottom: 4px;">
        <span style="background: ${iconColor}30; color: ${iconColor}; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; text-transform: uppercase;">${incident.incidentType}</span>
        <span style="background: #ef444430; color: #f87171; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; text-transform: uppercase;">${incident.severity}</span>
      </div>
      <strong style="color: #f8fafc; font-size: 13px;">${incident.title}</strong><br/>
      <p style="color: #cbd5e1; margin: 4px 0;">${incident.description || ''}</p>
      <div style="color: #94a3b8; font-size: 11px; margin-top: 6px;">
        <span>Hora: ${incident.hora || new Date(incident.detectedAt).toLocaleTimeString()}</span><br/>
        <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" style="color: #60a5fa; text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin-top: 6px;">
          <i class="fa-solid fa-map-location-dot"></i> Abrir en Google Maps &rarr;
        </a>
      </div>
    </div>
  `;

  if (incidentMarkers.has(incident.id)) {
    const marker = incidentMarkers.get(incident.id);
    marker.setLatLng([incident.latitude, incident.longitude]);
    marker.getPopup().setContent(popupContent);
  } else {
    const marker = L.marker([incident.latitude, incident.longitude], { icon: incidentIcon })
      .bindPopup(popupContent)
      .addTo(mapInstance);
    incidentMarkers.set(incident.id, marker);
  }
}

/**
 * Centra la vista del mapa en coordenadas dadas
 * @param {number} lat
 * @param {number} lng
 * @param {number} zoom
 */
function centerMapAt(lat, lng, zoom = 12) {
  if (mapInstance && lat && lng) {
    mapInstance.flyTo([lat, lng], zoom, {
      duration: 1.2,
    });
  }
}

window.initLiveMap = initLiveMap;
window.updateDeviceMarker = updateDeviceMarker;
window.addIncidentMarker = addIncidentMarker;
window.centerMapAt = centerMapAt;

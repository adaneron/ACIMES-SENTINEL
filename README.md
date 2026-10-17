# 📡 RALLY 2026 - Plataforma de Telemetría & Notificaciones en Tiempo Real

Plataforma integral construida con **Node.js, Express, JavaScript (ESM), Drizzle ORM, PostgreSQL, WebSockets (Socket.IO) y Docker**. Permite monitorear dispositivos móviles Android en tiempo real, procesar telemetría de acelerómetro con detección automática de sismos, recibir evidencia fotográfica periódica de cámaras externas con verificación OCR de inundaciones, rastreo GPS, sistema de heartbeats y gestión de informes de incidencias con control de acceso por roles.

---

## 🚀 Características Principales

1. **Notificaciones en Tiempo Real (Socket.IO)**:
   - Transmisión bidireccional inmediata de alertas de sismo, inundación, desconexiones y telemetría.
   - Interfaz web interactiva con mapa Leaflet, ondas sísmicas animadas, alarmas sonoras y toasts emergentes.

2. **Drizzle ORM & PostgreSQL**:
   - Modelado relacional completo con claves foráneas, índices y migraciones automáticas.
   - Tablas: `users`, `devices`, `device_telemetries`, `device_heartbeats`, `camera_evidences`, `incidents`.
   - Definición de relaciones con `relations()` de Drizzle ORM.

3. **Telemetría de Acelerómetro & Detección de Sismos**:
   - Cálculo del vector resultante de aceleración triaxial: $\text{magnitud} = \sqrt{x^2 + y^2 + z^2}$.
   - Si la magnitud supera el umbral configurado (`SEISMIC_ACCEL_THRESHOLD=14.5` m/s²), el sistema dispara automáticamente una incidencia de tipo **"sismo"** con severidad calculada (media, alta o crítica) y emite una alerta global inmediata.

4. **Cámara Externa & Verificación OCR de Inundación**:
   - Endpoint multipart para fotos periódicas enviadas por la app Android (`POST /api/evidence/upload`).
   - Almacenamiento seguro de evidencia fotográfica con metadatos (tamaño, coordenadas GPS, fecha/hora).
   - **Módulo de OCR desacoplado**: cuenta con un hook para conectar cualquier API externa (`EXTERNAL_OCR_API_URL` y `EXTERNAL_OCR_API_KEY`) y un motor heurístico/simulador listo para pruebas de nivel de agua y reglas hidrométricas.
   - Ante confirmación de anegamiento, genera automáticamente el informe de incidencia de tipo **"inundacion"** vinculado a la foto.

5. **Rastreo GPS de Precisión**:
   - Registro de latitud, longitud, altitud, precisión y velocidad.
   - Actualización en tiempo real de marcadores en el mapa interactivo.

6. **Sistema de Heartbeats & Estado Vital**:
   - Recepción periódica de pulso de los dispositivos: nivel de batería (0-100%), estado de carga (`isCharging`), temperatura de batería y temperatura de CPU.
   - Demonio en segundo plano (`heartbeatMonitor`): si un dispositivo no emite pulso en 120 segundos, pasa automáticamente a estado **OFFLINE** y notifica a los operadores.

7. **Control de Acceso (RBAC)**:
   - **Usuarios Regulares**: acceso libre sin necesidad de login ni registro para visualizar el mapa en vivo, las alertas activas, las estadísticas y consultar informes.
   - **Administradores**: autenticación segura JWT (`POST /api/auth/login`) para dar de alta/baja dispositivos, regenerar claves API y resolver/cerrar incidencias operativas.

8. **Simulador Android Integrado**:
   - Banco de pruebas dentro del dashboard web para simular sacudidas telúricas fuertes, subida de fotos con detección de inundación y envío de heartbeats sin requerir el hardware físico de inmediato.

---

## 🗄️ Esquema de Base de Datos y Relaciones (Drizzle ORM)

```
       ┌────────────────────────┐
       │         users          │
       │ (Administradores/Op)   │
       └───────────┬────────────┘
                   │ 1:N
                   ▼
┌──────────────┐ 1:N  ┌────────────────────────┐  1:1  ┌────────────────────────┐
│   devices    ├─────►│       incidents        │◄─────┤    camera_evidences    │
│  (Android)   │      │ (Informes/Severidad)   │      │  (Fotos periódicas)    │
└──────┬───────┘      └────────────────────────┘      └───────────┬────────────┘
       │                                                          │
       ├──────────────► device_telemetries (Acelerómetro + GPS)   │
       │ 1:N                                                      │ 1:N
       └──────────────► device_heartbeats (Batería, Temp, Red) ◄──┘
         1:N
```

### Relaciones definidas en `src/db/schema.js`:
- `devicesRelations`: posee muchas `telemetries`, `heartbeats`, `evidences` e `incidents`.
- `incidentsRelations`: pertenece a un `device`, pertenece a una `cameraEvidence` y pertenece a un `resolvedBy` (`users`).
- `cameraEvidencesRelations`: pertenece a un `device` y se relaciona con `incidents`.
- `usersRelations`: posee muchos `incidents` resueltos.

---

## 📦 Puesta en Marcha Rápida con Docker Compose

La plataforma está 100% contenerizada y lista para producción:

```bash
# 1. Clonar o ingresar al directorio del proyecto
cd RALLY2026

# 2. Iniciar PostgreSQL y la API Express en Docker
docker compose up -d

# 3. Ver los logs en tiempo real
docker compose logs -f app
```

El servidor estará disponible en:
- **Dashboard Web en Vivo**: [http://localhost:4000](http://localhost:4000)
- **API Health Check**: [http://localhost:4000/api/health](http://localhost:4000/api/health)
- **Endpoints de Informes**: [http://localhost:4000/api/reports](http://localhost:4000/api/reports)

---

## 🛠️ Ejecución Local para Desarrollo

Si deseas ejecutarlo directamente en Node.js en tu máquina anfitriona:

### Requisitos:
- Node.js >= 20 (recomendado v22)
- PostgreSQL corriendo localmente o en Docker (`docker compose up -d postgres`)

### Pasos:

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env

# 3. Aplicar migraciones a PostgreSQL
npm run db:migrate

# 4. Poblar datos iniciales (Admin por defecto y 3 dispositivos de prueba)
npm run db:seed

# 5. Iniciar en modo desarrollo con recarga en caliente
npm run dev
```

### Ejecución de Pruebas Automatizadas:

```bash
npm test
```
*Suite completa con 20 pruebas unitarias y de integración pasando al 100%.*

---

## 🔐 Credenciales Iniciales

- **Administrador por Defecto**:
  - **Correo**: `admin@rally2026.com`
  - **Contraseña**: `admin123456`
- **Dispositivos Móviles (Red Centinela)**:
  - Los nodos móviles se registran dinámicamente (`/api/devices/register-node`) y son autorizados por el Administrador desde el panel táctico.
  - Nodo en producción activo: `Centinela Nodo 01` (Barcelona, Anzoátegui, Venezuela).

---

## 📡 Referencia de la API REST

### 1. Autenticación & Control de Acceso
| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/api/auth/login` | Público | Inicio de sesión para administradores. Retorna token JWT. |
| `GET` | `/api/auth/me` | Administrador | Obtiene los datos del administrador autenticado. |

### 2. Dispositivos & Heartbeats
| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/devices` | Público | Lista todos los dispositivos con estado online/offline calculado y última batería. |
| `GET` | `/api/devices/:id` | Público | Detalle de un dispositivo con sus últimas telemetrías y heartbeats. |
| `POST` | `/api/devices` | Administrador | Registra un nuevo dispositivo móvil Android. |
| `POST` | `/api/devices/:id/regenerate-key` | Administrador | Regenera la clave de API del dispositivo. |
| `POST` | `/api/heartbeat` | Dispositivo (`x-api-key`) | Registra nivel de batería, carga, temperatura de CPU/batería y conectividad. |

### 3. Telemetría & Evidencia Fotográfica
| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/api/telemetry` | Dispositivo (`x-api-key`) | Envía acelerómetro ($x,y,z$) y coordenadas GPS. Si hay sacudida fuerte, dispara alerta de sismo. |
| `GET` | `/api/telemetry/recent` | Público | Historial de telemetría reciente para gráficas o análisis. |
| `POST` | `/api/evidence/upload` | Dispositivo (`x-api-key`) | Sube foto (`multipart/form-data`) de cámara externa y ejecuta verificación OCR de inundación. |
| `GET` | `/api/evidence` | Público | Lista evidencias fotográficas subidas. |
| `GET` | `/api/evidence/:id` | Público | Detalle de una foto y su resultado de análisis OCR. |

### 4. Informes e Incidencias
| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/reports` | Público | **Informe completo**: ubicación, tipo, nivel de severidad, hora y evidencia vinculada. Filtros por `type`, `severity`, `status`, `from`, `to`. |
| `GET` | `/api/reports/stats` | Público | Resumen estadístico agrupado por tipo y severidad. |
| `GET` | `/api/reports/export/csv` | Público | Exporta todo el registro histórico de incidencias a formato CSV. |
| `GET` | `/api/reports/:id` | Público | Detalle específico de un informe de incidencia. |
| `POST` | `/api/reports` | Administrador | Ingreso manual de una incidencia por parte de un operador. |
| `PATCH` | `/api/reports/:id/status` | Administrador | Actualiza el estado de una incidencia (ej. `resuelta`) y registra observaciones. |

---

## 🌊 Configuración de la API Externa de OCR (Inundaciones)

El sistema está diseñado de forma modular. Cuando tengas lista la API externa de OCR para verificar las fotos de la cámara:
1. Edita el archivo `.env` o las variables de entorno en `docker-compose.yml`:
   ```env
   EXTERNAL_OCR_API_URL=https://tu-api-ocr.com/analizar-inundacion
   EXTERNAL_OCR_API_KEY=tu_token_secreto_aqui
   ```
2. El servicio `src/services/floodOcrService.js` despachará automáticamente la imagen entrante en formato `multipart/form-data` a dicha URL y mapeará la respuesta (`flood_detected`, `confidence`, `water_level_cm`, `ocr_text`).
3. Si estas variables están vacías, el sistema utiliza el analizador heurístico integrado, ideal para entornos de desarrollo y pruebas.

---

## 🧪 Banco de Pruebas (Simulador Android en Navegador)

Para probar la plataforma inmediatamente sin tener una app Android compilada:
1. Abre [http://localhost:4000](http://localhost:4000) en tu navegador.
2. Haz clic en la pestaña **"Simulador Android"**.
3. Selecciona cualquiera de los 3 dispositivos de prueba.
4. Presiona **"¡Simular Sismo Fuerte (18 m/s²)!"**:
   - Observarás la alarma sísmica en vivo en el toast, la sirena sonora, la onda expansiva en el mapa Leaflet y el registro inmediato en la tabla de informes.
5. Presiona **"Subir Foto & Verificar Inundación"**:
   - Generará una evidencia fotográfica, ejecutará el OCR y creará la incidencia con evidencia enlazada.
6. Ajusta el deslizador de batería o temperatura y presiona **"Enviar Heartbeat Ahora"** para verificar cómo se actualiza la tarjeta del dispositivo y el mapa en tiempo real.

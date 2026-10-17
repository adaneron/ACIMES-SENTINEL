import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { config } from './config/env.js';
import { errorHandler } from './middlewares/errorHandler.js';

import publicRoutes from './routes/publicRoutes.js';
import authRoutes from './routes/authRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import heartbeatRoutes from './routes/heartbeatRoutes.js';
import telemetryRoutes from './routes/telemetryRoutes.js';
import evidenceRoutes from './routes/evidenceRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// Middlewares base
app.use(cors({ origin: config.corsOrigin }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos estáticos subidos (evidencias fotográficas)
const uploadsPath = path.resolve(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsPath));
app.use('/api/uploads', express.static(uploadsPath));

// Determinar directorio estático: prioridad a la app React en Vite (client/dist)
const clientDistPath = path.resolve(process.cwd(), 'client', 'dist');
const legacyPublicPath = path.resolve(__dirname, 'public');
const hasClientDist = fs.existsSync(clientDistPath);
const staticPath = hasClientDist ? clientDistPath : legacyPublicPath;

// Servir frontend dashboard con no-cache para index.html para evitar caché en navegadores/Cloudflare
app.use(
  express.static(staticPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    },
  })
);

// Rutas de la API
app.use('/api', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/heartbeat', heartbeatRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/incidents', reportRoutes); // Alias para consistencia
app.use('/api/emergency-contacts', contactRoutes);
app.use('/api/settings', settingsRoutes);

// Descarga oficial del instalador de la APK para Nodos Centinela
app.get(['/api/downloads/centinela-apk', '/api/download/apk', '/downloads/centinela-apk'], (req, res) => {
  const candidatePaths = [
    path.resolve(process.cwd(), 'uploads', 'downloads', 'Centinela-ACIMES.apk'),
    path.resolve(process.cwd(), 'client', 'dist', 'downloads', 'Centinela-ACIMES.apk'),
    path.resolve(process.cwd(), 'client', 'public', 'downloads', 'Centinela-ACIMES.apk'),
    path.resolve(process.cwd(), 'centinela_app', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
  ];

  const apkPath = candidatePaths.find((p) => fs.existsSync(p));

  if (!apkPath) {
    return res.status(404).json({
      success: false,
      error: 'El paquete de instalación APK no se encuentra disponible actualmente en el servidor.'
    });
  }

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="Centinela-ACIMES.apk"');
  return res.sendFile(apkPath);
});

// Fallback para SPA en el frontend (Express 5 compatible)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(path.join(staticPath, 'index.html'));
  }
  next();
});

// Manejador de rutas no encontradas (404)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
});

// Manejador centralizado de errores
app.use(errorHandler);

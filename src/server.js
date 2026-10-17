import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { app } from './app.js';
import { config } from './config/env.js';
import { checkDbConnection, pool } from './config/database.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';
import { initSocketService } from './services/socketService.js';
import { startHeartbeatMonitor, stopHeartbeatMonitor } from './services/heartbeatMonitor.js';

const server = http.createServer(app);

// Inicializar Socket.IO para notificaciones y telemetría en tiempo real
const io = new SocketIOServer(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  },
});

initSocketService(io);

async function startServer() {
  console.log('🚀 Iniciando Plataforma de Notificaciones de Telemetría (RALLY 2026)...');

  // Verificar conectividad con PostgreSQL
  const dbConnected = await checkDbConnection();
  if (!dbConnected) {
    console.error('❌ No se pudo conectar a PostgreSQL en:', config.databaseUrl);
    console.error('👉 Asegúrate de que el contenedor de Docker o servicio Postgres esté activo.');
    process.exit(1);
  }
  console.log('📦 Conexión a base de datos PostgreSQL exitosa.');

  // Ejecutar migraciones automáticas al arrancar
  try {
    await runMigrations();
  } catch (migErr) {
    console.warn('⚠️ Nota sobre migraciones:', migErr.message);
  }

  // Ejecutar seed inicial si es necesario
  try {
    await seedDatabase();
  } catch (seedErr) {
    console.warn('⚠️ Nota sobre seed:', seedErr.message);
  }

  // Iniciar monitor de dispositivos y heartbeats en segundo plano
  startHeartbeatMonitor();

  // Iniciar servidor HTTP y WebSockets
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`\n=============================================================`);
    console.log(`📡 Servidor Express activo en: http://localhost:${config.port}`);
    console.log(`⚡ WebSocket (Socket.io) escuchando en puerto: ${config.port}`);
    console.log(`📋 Entorno: ${config.nodeEnv}`);
    console.log(`🌐 Dashboard web disponible en: http://localhost:${config.port}`);
    console.log(`📊 API de Informes en: http://localhost:${config.port}/api/reports`);
    console.log(`=============================================================\n`);
  });
}

// Cierre controlado (Graceful Shutdown)
function gracefulShutdown(signal) {
  console.log(`\n🛑 Señal ${signal} recibida. Cerrando servicios...`);
  stopHeartbeatMonitor();

  server.close(async () => {
    console.log('🔌 Servidor HTTP y WebSockets cerrados.');
    try {
      await pool.end();
      console.log('📦 Conexiones de base de datos finalizadas.');
    } catch (e) {
      console.error('Error al cerrar pool de BD:', e.message);
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error('⚠️ Forzando cierre del proceso tras timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer().catch((err) => {
  console.error('💥 Error fatal al arrancar el servidor:', err);
  process.exit(1);
});

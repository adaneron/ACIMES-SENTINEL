import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool, checkDbConnection } from '../config/database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ejecuta las migraciones pendientes en la base de datos
 */
export async function runMigrations() {
  console.log('🔄 Verificando y aplicando migraciones de base de datos...');
  const connected = await checkDbConnection();
  if (!connected) {
    throw new Error('No se pudo conectar a la base de datos para ejecutar migraciones.');
  }

  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder });
  console.log('✅ Migraciones aplicadas exitosamente.');
}

// Si se ejecuta directamente desde la CLI: node src/db/migrate.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Error ejecutando migraciones:', err);
      await pool.end();
      process.exit(1);
    });
}

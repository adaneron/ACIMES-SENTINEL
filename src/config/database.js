import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { config } from './env.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Eventos del pool de conexiones para monitoreo
pool.on('error', (err) => {
  console.error('[Database Pool Error]:', err.message);
});

export const db = drizzle(pool, { schema });

/**
 * Verifica la conectividad con la base de datos PostgreSQL
 * @returns {Promise<boolean>}
 */
export async function checkDbConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Error al conectar a PostgreSQL:', error.message);
    return false;
  }
}

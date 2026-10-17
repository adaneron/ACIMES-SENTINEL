import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { systemSettings } from '../db/schema.js';

let cachedConsensusSettings = {
  minDevices: 1,
  windowSeconds: 15,
};

/**
 * Obtiene la configuración actual de consenso sísmico multi-nodo
 */
export async function getSeismicConsensusSettings() {
  try {
    const [record] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'seismic_consensus'));

    if (record?.value) {
      cachedConsensusSettings = {
        minDevices: Math.max(1, parseInt(record.value.minDevices, 10) || 1),
        windowSeconds: Math.max(5, parseInt(record.value.windowSeconds, 10) || 15),
      };
    }
  } catch (err) {
    console.warn('⚠️ No se pudo consultar seismic_consensus de BD, usando valor en caché:', err.message);
  }

  return cachedConsensusSettings;
}

/**
 * Actualiza la configuración de consenso sísmico multi-nodo
 * @param {number} minDevices Cantidad de nodos simultáneos requeridos para alertar
 * @param {number} windowSeconds Ventana de tiempo de coincidencia en segundos (default: 15)
 */
export async function updateSeismicConsensusSettings(minDevices = 1, windowSeconds = 15) {
  const cleanMin = Math.max(1, Math.min(10, parseInt(minDevices, 10) || 1));
  const cleanWindow = Math.max(5, Math.min(60, parseInt(windowSeconds, 10) || 15));

  const newValue = {
    minDevices: cleanMin,
    windowSeconds: cleanWindow,
  };

  try {
    await db
      .insert(systemSettings)
      .values({
        key: 'seismic_consensus',
        value: newValue,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: newValue,
          updatedAt: new Date(),
        },
      });

    cachedConsensusSettings = newValue;
    return newValue;
  } catch (err) {
    console.error('❌ Error al actualizar seismic_consensus en BD:', err.message);
    cachedConsensusSettings = newValue;
    return newValue;
  }
}

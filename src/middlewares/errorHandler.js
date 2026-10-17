import { ZodError } from 'zod';
import multer from 'multer';

/**
 * Middleware central de manejo de errores
 */
export function errorHandler(err, req, res, _next) {
  // Error de validación con Zod
  if (err instanceof ZodError) {
    const issues = err.issues || err.errors || [];
    return res.status(400).json({
      success: false,
      error: 'Error de validación de datos de entrada.',
      details: issues.map((e) => ({
        field: (e.path || []).join('.'),
        message: e.message,
      })),
    });
  }

  // Error de Multer (subida de archivos)
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'El archivo fotográfico excede el tamaño máximo permitido (20 MB).',
      });
    }
    return res.status(400).json({
      success: false,
      error: `Error al procesar la imagen: ${err.message}`,
    });
  }

  // Error de formato o JSON inválido
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'El cuerpo de la solicitud (JSON) está mal formado.',
    });
  }

  console.error('[Unhandled Server Error]:', err);

  const status = err.status || 500;
  return res.status(status).json({
    success: false,
    error: err.message || 'Error interno del servidor.',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
}

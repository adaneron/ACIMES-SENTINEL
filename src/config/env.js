import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/rally_db',
  
  jwtSecret: process.env.JWT_SECRET || 'super_secret_jwt_key_rally_2026_default',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  
  admin: {
    name: process.env.ADMIN_NAME || 'Administrador del Sistema',
    email: process.env.ADMIN_EMAIL || 'admin@rally2026.com',
    password: process.env.ADMIN_PASSWORD || 'admin123456',
  },
  
  // Seismic threshold in m/s² (Earth gravity is ~9.81 m/s²; sudden peaks > 14.5 m/s² indicate strong shake)
  seismicAccelThreshold: parseFloat(process.env.SEISMIC_ACCEL_THRESHOLD || '14.5'),
  
  // Heartbeat timeout in seconds (after this duration without a heartbeat, device is marked offline)
  heartbeatTimeoutSeconds: parseInt(process.env.HEARTBEAT_TIMEOUT_SECONDS || '120', 10),
  
  // Integración con API externa de OCR / LM Studio Vision (Qwen 3.5)
  externalOcr: {
    apiUrl: process.env.EXTERNAL_OCR_API_URL || 'http://192.168.0.101:1234/v1/chat/completions',
    model: process.env.EXTERNAL_OCR_MODEL || 'qwen3.5-4b-instruct-revised',
    apiKey: process.env.EXTERNAL_OCR_API_KEY || '',
  },
  
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

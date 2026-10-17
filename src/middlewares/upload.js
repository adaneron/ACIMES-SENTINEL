import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const uploadDir = path.resolve(process.cwd(), 'uploads/evidences');

// Asegurar que el directorio de uploads existe
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `evidence_${uniqueSuffix}_${cleanName}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/tiff'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Solo se permiten imágenes (JPEG, PNG, WEBP).`), false);
  }
};

export const uploadEvidenceImage = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB límite
  },
  fileFilter,
});

export const uploadEvidenceMiddleware = (req, res, next) => {
  uploadEvidenceImage.any()(req, res, (err) => {
    if (err) return next(err);
    if (req.files && req.files.length > 0) {
      req.file = req.files.find((f) => f.fieldname === 'photo') ||
                 req.files.find((f) => f.fieldname === 'file') ||
                 req.files.find((f) => f.fieldname === 'image') ||
                 req.files[0];
    }
    next();
  });
};


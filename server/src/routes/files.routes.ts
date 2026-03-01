// server/src/routes/files.routes.ts
import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { uploadFile, getFiles, downloadFile, deleteFile } from '../controllers/files.controller';
import { ALLOWED_MIME_TYPES, getMaxFileSizeBytes } from '../services/file-ingest.service';

const router = Router();
const upload = multer({
  // limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  // fileFilter: (req, file, cb) => {
  //   // Можно добавить проверку типов файлов
  limits: { fileSize: getMaxFileSizeBytes() },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Допустимы только DOCX файлы'));
    }
    cb(null, true);
  },
});

router.post('/upload', authMiddleware, upload.single('file'), uploadFile);
router.get('/', authMiddleware, getFiles);
router.get('/:id', authMiddleware, downloadFile);
router.delete('/:id', authMiddleware, deleteFile);

export default router;
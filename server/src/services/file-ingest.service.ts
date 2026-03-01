import { createHash, randomUUID } from 'crypto';
import mammoth from 'mammoth';

export const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const parseMaxSizeMb = (): number => {
  const value = Number(process.env.FILES_MAX_SIZE_MB || '20');
  if (!Number.isFinite(value) || value <= 0) {
    return 20;
  }
  return value;
};

export const getMaxFileSizeBytes = (): number => Math.floor(parseMaxSizeMb() * 1024 * 1024);

const cleanText = (input: string): string => {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractDocxText = async (buffer: Buffer): Promise<string> => {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
};

export const extractTextFromFile = async (buffer: Buffer, mimetype: string): Promise<string> => {
  if (mimetype !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    throw new Error('Неподдерживаемый тип файла для извлечения текста');
  }

  const raw = await extractDocxText(buffer);
  return cleanText(raw);
};

export const resolveFileScope = (userId: number): string => {
  const sharedMode = String(process.env.FILES_SHARED_MODE || 'false').toLowerCase() === 'true';
  return sharedMode ? 'shared' : `user_${userId}`;
};

export const buildSurrealDocumentId = (scope: string): string => {
  // return `filedoc:${scope.replace(/[^a-zA-Z0-9_-]/g, '_')}_${randomUUID()}`;
  const uuid = randomUUID().replace(/-/g, ''); // удаляем дефисы из UUID
  const safeScope = scope.replace(/[^a-zA-Z0-9]/g, '_'); // заменяем всё кроме букв и цифр на '_'
  return `filedoc:${safeScope}_${uuid}`;
};

export const buildContentDigest = (buffer: Buffer): string => {
  return createHash('sha256').update(buffer).digest('hex');
};

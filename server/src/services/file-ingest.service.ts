import { createHash, randomUUID } from 'crypto';
import mammoth from 'mammoth';

export const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export interface TextChunk {
  index: number;
  content: string;
}

const parseMaxSizeMb = (): number => {
  const value = Number(process.env.FILES_MAX_SIZE_MB || '20');
  if (!Number.isFinite(value) || value <= 0) {
    return 20;
  }
  return value;
};

const parseChunkSize = (): number => {
  const value = Number(process.env.FILE_CHUNK_SIZE || '1000');
  if (!Number.isFinite(value) || value < 200) {
    return 1000;
  }
  return Math.floor(value);
};

const parseChunkOverlap = (): number => {
  const value = Number(process.env.FILE_CHUNK_OVERLAP || '150');
  if (!Number.isFinite(value) || value < 0) {
    return 150;
  }
  return Math.floor(value);
};

const parseMaxChunks = (): number => {
  const value = Number(process.env.FILE_MAX_CHUNKS || '200');
  if (!Number.isFinite(value) || value <= 0) {
    return 200;
  }
  return Math.floor(value);
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

export const chunkText = (text: string): TextChunk[] => {
  const normalized = cleanText(text);
  if (!normalized) return [];

  const chunkSize = parseChunkSize();
  const overlap = Math.min(parseChunkOverlap(), Math.floor(chunkSize / 2));
  const maxChunks = parseMaxChunks();
  const step = Math.max(1, chunkSize - overlap);

  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < normalized.length && chunks.length < maxChunks) {
    const end = Math.min(start + chunkSize, normalized.length);
    const slice = normalized.slice(start, end).trim();

    if (slice) {
      chunks.push({
        index: chunks.length,
        content: slice,
      });
    }

    if (end >= normalized.length) break;
    start += step;
  }

  return chunks;
};

export const resolveFileScope = (userId: number): string => {
  // const sharedMode = String(process.env.FILES_SHARED_MODE || 'false').toLowerCase() === 'true';
  const sharedMode = String(process.env.FILES_SHARED_MODE || 'true').toLowerCase() === 'true';
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

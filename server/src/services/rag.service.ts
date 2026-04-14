import 'dotenv/config';
import {
  countDocumentsByScope,
  listEmbeddedChunksByScope,
  setChunkEmbedding,
  setChunkEmbeddingFailed,
  setFileDocumentEmbeddingStatus,
} from '../db/surreal';
import { TextChunk } from './file-ingest.service';

export type RetrievalReason = 'OK' | 'NO_FILES' | 'NO_EMBEDDINGS' | 'NO_MATCH' | 'RETRIEVAL_ERROR';

interface RetrievalResult {
  reason: RetrievalReason;
  context: string;
  usedChunks: number;
  usedFolders: string[];
  debug: string;
}

const getEmbeddingModel = (): string => process.env.RAG_EMBEDDING_MODEL || 'qwen/qwen3-embedding-8b';
const getTopK = (): number => Math.max(1, Number(process.env.RAG_TOP_K || '5'));
const getMinScore = (): number => Number(process.env.RAG_MIN_SCORE || '0');
const getMaxContextChars = (): number => Math.max(500, Number(process.env.RAG_MAX_CONTEXT_CHARS || '3000'));
const isRagEnabled = (): boolean => String(process.env.RAG_ENABLE || 'true').toLowerCase() === 'true';

const resolveFolderLabel = (chunk: { folder_name?: string; content: string }): string => {
  const raw = String(chunk.folder_name || '').trim();
  if (raw) return raw;

  const content = chunk.content.toLowerCase();
  if (content.includes('практическ') || content.includes('задание')) {
    return 'Практика';
  }
  if (content.includes('лекци')) {
    return 'Лекции';
  }
  return 'Материалы';
};

const computeIntentBoost = (query: string, content: string, folderName: string): number => {
  const q = query.toLowerCase();
  const c = content.toLowerCase();

  const practicalIntent = /(задач|реши|решить|номер|практик)/.test(q);
  const theoryIntent = /(объясни|теори|лекци|что такое|поясни)/.test(q);

  let boost = 0;
  if (practicalIntent && (folderName === 'Практика' || c.includes('задание') || c.includes('практическ'))) {
    boost += 0.12;
  }
  if (theoryIntent && (folderName === 'Лекции' || c.includes('лекци'))) {
    boost += 0.08;
  }
  return boost;
};

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const getOpenRouterApiKey = (): string => {
  const key = process.env.OPENROUTER_EMBEDDING_MODEL;
  if (!key) {
    throw new Error('OPENROUTER_EMBEDDING_MODEL is missing');
  }
  return key;
};

const createEmbeddings = async (inputs: string[]): Promise<number[][]> => {
  const apiKey = getOpenRouterApiKey();
  const model = getEmbeddingModel();

  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost',
      'X-Title': process.env.APP_NAME || 'AI Assistant',
    },
    body: JSON.stringify({
      model,
      input: inputs,
      encoding_format: 'float',
      dimensions: process.env.RAG_EMBEDDING_DIM ? Number(process.env.RAG_EMBEDDING_DIM) : undefined,
    }),
  });

  const payloadText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter embeddings failed (${response.status}): ${payloadText}`);
  }

  const payload = JSON.parse(payloadText) as { data?: Array<{ embedding?: number[] }> };
  const vectors = (payload.data || []).map((item) => item.embedding || []).filter((e) => Array.isArray(e) && e.length > 0);

  if (vectors.length !== inputs.length) {
    throw new Error(`Embeddings response size mismatch: expected ${inputs.length}, got ${vectors.length}`);
  }

  return vectors;
};

export const embedChunksForDocument = async (
  docId: string,
  chunks: TextChunk[],
): Promise<{ status: 'ready' | 'failed'; message: string }> => {
  if (!isRagEnabled()) {
    await setFileDocumentEmbeddingStatus(docId, 'failed', 'RAG is disabled by env');
    return { status: 'failed', message: 'RAG disabled' };
  }

  try {
    const embeddings = await createEmbeddings(chunks.map((chunk) => chunk.content));
    const model = getEmbeddingModel();

    for (let i = 0; i < chunks.length; i += 1) {
      await setChunkEmbedding(docId, chunks[i].index, embeddings[i], model);
    }

    await setFileDocumentEmbeddingStatus(docId, 'ready');
    return { status: 'ready', message: `Embeddings ready (${embeddings.length})` };
  } catch (error: any) {
    const errText = String(error?.message || error || 'embedding failed').slice(0, 500);
    for (const chunk of chunks) {
      try {
        await setChunkEmbeddingFailed(docId, chunk.index, errText);
      } catch {
        // ignore chunk-level status failure
      }
    }
    await setFileDocumentEmbeddingStatus(docId, 'failed', errText);
    return { status: 'failed', message: errText };
  }
};

export const retrieveContextForChat = async (userId: number, query: string, scope: string): Promise<RetrievalResult> => {
  if (!isRagEnabled()) {
    return { reason: 'RETRIEVAL_ERROR', context: '', usedChunks: 0, usedFolders: [], debug: 'RAG disabled by env' };
  }

  try {
    const docsCount = await countDocumentsByScope(scope, userId);
    if (docsCount === 0) {
      return { reason: 'NO_FILES', context: '', usedChunks: 0, usedFolders: [], debug: 'No files in scope' };
    }

    const candidates = await listEmbeddedChunksByScope(scope, userId, 400);
    if (candidates.length === 0) {
      return { reason: 'NO_EMBEDDINGS', context: '', usedChunks: 0, usedFolders: [], debug: 'No embedded chunks found' };
    }

    const [queryEmbedding] = await createEmbeddings([query]);
    const minScore = getMinScore();
    const topK = getTopK();

    const ranked = candidates
      .map((chunk) => ({
        chunk,
        folderName: resolveFolderLabel(chunk),
        baseScore: cosineSimilarity(queryEmbedding, chunk.embedding),
      }))
      .map((item) => ({
        ...item,
        score: item.baseScore + computeIntentBoost(query, item.chunk.content, item.folderName),
      }))
      .filter((item) => Number.isFinite(item.score) && item.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    if (ranked.length === 0) {
      return { reason: 'NO_MATCH', context: '', usedChunks: 0, usedFolders: [], debug: `No chunks above min score ${minScore}` };
    }

    const maxChars = getMaxContextChars();
    const contextChunks: string[] = [];
    const folders = new Set<string>();
    let total = 0;

    for (const item of ranked) {
      const folderName = item.chunk.folder_name || 'Лекции';
      folders.add(folderName);
      const line = `[folder:${folderName}] [doc:${item.chunk.doc_id}#${item.chunk.chunk_index} score=${item.score.toFixed(3)}] ${item.chunk.content}`;
      if (total + line.length > maxChars) break;
      contextChunks.push(line);
      total += line.length;
    }

    return {
      reason: 'OK',
      context: contextChunks.join('\n\n'),
      usedChunks: contextChunks.length,
      usedFolders: Array.from(folders).sort((a, b) => a.localeCompare(b, 'ru')),
      debug: `Candidates=${candidates.length}, Selected=${contextChunks.length}, Folders=${Array.from(folders).join(',')}`,
    };
  } catch (error: any) {
    return {
      reason: 'RETRIEVAL_ERROR',
      context: '',
      usedChunks: 0,
      usedFolders: [],
      debug: String(error?.message || error || 'retrieval error').slice(0, 500),
    };
  }
};

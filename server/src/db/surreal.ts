import 'dotenv/config';

interface SurrealConfig {
  url: string;
  namespace: string;
  database: string;
  username: string;
  password: string;
}

interface SurrealDocumentInput {
  id: string;
  scope: string;
  userId: number;
  folderName: string;
  originalName: string;
  mimeType: string;
  size: number;
  textContent: string;
  contentDigest: string;
  uploadedAtIso: string;
}

interface SurrealChunkInput {
  docId: string;
  scope: string;
  userId: number;
  folderName: string;
  chunkIndex: number;
  content: string;
  uploadedAtIso: string;
}

export interface SurrealEmbeddedChunk {
  id: string;
  doc_id: string;
  folder_name: string;
  content: string;
  embedding: number[];
  chunk_index: number;
}

// helper-функция чтобы не писать везде db и ns:
const buildSqlWithNamespace = (sql: string): string => {
  const config = resolveSurrealConfig();
  return `USE NS ${config.namespace} DB ${config.database}; ${sql}`;
};

const normalizeBaseUrl = (rawUrl: string): string => {
  const withoutTrailingSlash = rawUrl.replace(/\/+$/, '');
  return withoutTrailingSlash.endsWith('/rpc')
    ? withoutTrailingSlash.slice(0, -4)
    : withoutTrailingSlash;
};

const resolveSurrealConfig = (): SurrealConfig => { //Потом убрать и иcпользовать параметры из env
  const url = process.env.SURREAL_URL || 'http://localhost:8001/rpc';

  return {
    url: normalizeBaseUrl(url),
    namespace: process.env.SURREAL_NS || 'ai_assistant',
    database: process.env.SURREAL_DB || 'main',
    username: process.env.SURREAL_USER || 'root',
    password: process.env.SURREAL_PASS || 'root',
  };
};

const extractTokenFromSigninResponse = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return trimmed.replace(/^"|"$/g, '');
  }

  try {
    const parsed = JSON.parse(trimmed) as
      | { token?: string; result?: string; data?: { token?: string } }
      | { token?: string }[];

    if (Array.isArray(parsed)) {
      return parsed.find((item) => typeof item?.token === 'string')?.token || '';
    }

    if (typeof parsed.token === 'string') return parsed.token;
    if (typeof parsed.result === 'string') return parsed.result;
    if (typeof parsed.data?.token === 'string') return parsed.data.token;

    return '';
  } catch {
    return '';
  }
};

const signin = async (config: SurrealConfig): Promise<string> => {
  const response = await fetch(`${config.url}/signin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      user: config.username,
      pass: config.password,
    }),
  });

  const payload = await response.text();

  if (!response.ok) {
    throw new Error(`SurrealDB signin failed (${response.status}): ${payload}`);
  }

  const token = extractTokenFromSigninResponse(payload);
  if (!token) {
    throw new Error(`SurrealDB signin returned unsupported payload: ${payload}`);
  }

  return token;
};

const execSql = async (sql: string, token: string): Promise<string> => {
  const config = resolveSurrealConfig();

  const response = await fetch(`${config.url}/sql`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'text/plain',
      Authorization: `Bearer ${token}`,
      NS: config.namespace,
      DB: config.database,
    },
    body: sql,
  });

  const payload = await response.text();
  console.log('SurrealDB response:', payload);

  if (!response.ok) {
    throw new Error(`SurrealDB SQL failed (${response.status}): ${payload}`);
  }
  return payload;
};

const parseResult = (payload: string): any => {
  try {
    const parsed = JSON.parse(payload);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // ✅ Бери ПОСЛЕДНИЙ результат, а не первый
      // Первый — это USE NS DB, последний — результат запроса
      const last = parsed[parsed.length - 1];
      if (last && typeof last === 'object' && 'result' in last) {
        return (last as any).result;
      }
    }
    return parsed;
  } catch {
    return null;
  }
};

const escapeSqlString = (value: string): string => {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
};

const ensureToken = async (): Promise<string> => {
  const config = resolveSurrealConfig();
  return signin(config);
};

const buildChunkRecordId = (docId: string, chunkIndex: number): string => {
  const suffix = docId.replace(/^filedoc:/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `filechunk:${suffix}_${chunkIndex}`;
};

export const upsertFileDocument = async (input: SurrealDocumentInput): Promise<void> => {
  const token = await ensureToken();
  const config = resolveSurrealConfig();

  const ns = config.namespace;
  const db = config.database;

  const sql = `USE NS ${ns} DB ${db};
UPSERT ${input.id} CONTENT {
    scope: '${escapeSqlString(input.scope)}',
    user_id: ${input.userId},
    folder_name: '${escapeSqlString(input.folderName)}',
    original_name: '${escapeSqlString(input.originalName)}',
    mimetype: '${escapeSqlString(input.mimeType)}',
    size: ${input.size},
    text_content: '${escapeSqlString(input.textContent)}',
    text_length: ${input.textContent.length},
    content_digest: '${escapeSqlString(input.contentDigest)}',
    uploaded_at: d'${escapeSqlString(input.uploadedAtIso)}',
    status: 'indexed',
    embedding_status: 'pending'

  };`;

  // console.log('=== SurrealDB UPSERT SQL ===');
  // console.log(sql);
  // console.log('============================');  
  await execSql(sql, token);
};

export const setFileDocumentEmbeddingStatus = async (
  documentId: string,
  status: 'ready' | 'failed' | 'pending',
  errorMessage?: string,
): Promise<void> => {
  const token = await ensureToken();
  const errorPart = errorMessage
    ? `, embedding_error = '${escapeSqlString(errorMessage)}'`
    : ', embedding_error = NONE';
  const sql = buildSqlWithNamespace(`UPDATE ${escapeSqlString(documentId)} SET embedding_status = '${status}'${errorPart};`);
  await execSql(sql, token);
};

export const upsertFileChunks = async (chunks: SurrealChunkInput[]): Promise<void> => {
  if (chunks.length === 0) return;

  const token = await ensureToken();
  const config = resolveSurrealConfig();

  const sql = buildSqlWithNamespace(chunks.map((chunk) => {
    const chunkId = buildChunkRecordId(chunk.docId, chunk.chunkIndex);
    return `UPSERT ${chunkId} CONTENT {

      doc_id: '${escapeSqlString(chunk.docId)}',
      scope: '${escapeSqlString(chunk.scope)}',
      user_id: ${chunk.userId},
      folder_name: '${escapeSqlString(chunk.folderName)}',
      chunk_index: ${chunk.chunkIndex},
      content: '${escapeSqlString(chunk.content)}',
      content_length: ${chunk.content.length},
      uploaded_at: d'${escapeSqlString(chunk.uploadedAtIso)}',
      embedding_status: 'pending'
    };`;
  }).join('\n'));
  await execSql(sql, token);
};

export const setChunkEmbedding = async (
  docId: string,
  chunkIndex: number,
  embedding: number[],
  model: string,
): Promise<void> => {
  const token = await ensureToken();
  const chunkId = buildChunkRecordId(docId, chunkIndex);
  const embeddingSql = `[${embedding.map((v) => Number(v).toFixed(8)).join(',')}]`;
  const sql = buildSqlWithNamespace(`UPDATE ${chunkId} SET embedding = ${embeddingSql}, embedding_model = '${escapeSqlString(model)}', embedding_dim = ${embedding.length}, embedding_status = 'ready', embedding_error = NONE;`);
  await execSql(sql, token);
};

export const setChunkEmbeddingFailed = async (
  docId: string,
  chunkIndex: number,
  errorMessage: string,
): Promise<void> => {
  const token = await ensureToken();
  const chunkId = buildChunkRecordId(docId, chunkIndex);
  const sql = buildSqlWithNamespace(`UPDATE ${chunkId} SET embedding_status = 'failed', embedding_error = '${escapeSqlString(errorMessage)}';`);
  await execSql(sql, token);
};

export const deleteFileChunksByDocumentId = async (documentId: string): Promise<void> => {
  const token = await ensureToken();
  const sql = buildSqlWithNamespace(`DELETE filechunk WHERE doc_id = '${escapeSqlString(documentId)}';`);
  await execSql(sql, token);
};

export const getChunkCountByDocumentId = async (documentId: string): Promise<number> => {
  const token = await ensureToken();
  const sql = buildSqlWithNamespace(`RETURN count((SELECT VALUE id FROM filechunk WHERE doc_id = '${escapeSqlString(documentId)}'));`);
  const payload = await execSql(sql, token);
  const parsed = parseResult(payload);

  if (Array.isArray(parsed) && typeof parsed[0] === 'number') {
    return parsed[0];
  }

  const numberMatch = payload.match(/\b(\d+)\b/);
  return numberMatch ? Number(numberMatch[1]) : 0;
};

export const countDocumentsByScope = async (scope: string, userId: number): Promise<number> => {
  const token = await ensureToken();

  // Если shared режим, не фильтруем по user_id
  const isSharedMode = scope === 'shared';
  const userFilter = isSharedMode ? '' : ` AND user_id = ${userId}`;

  const sql = buildSqlWithNamespace(
    `RETURN count((SELECT VALUE id FROM filedoc WHERE scope = '${escapeSqlString(scope)}'${userFilter}));`
  );

  // const sql = buildSqlWithNamespace(
  //   `RETURN count((SELECT VALUE id FROM filedoc WHERE scope = '${escapeSqlString(scope)}' AND user_id = ${userId}));`
  // );
  
  // логи
  // console.log('countDocumentsByScope: scope=', scope, 'userId=', userId);
  // console.log('countDocumentsByScope: SQL=', sql);
  
  const payload = await execSql(sql, token);
  
  // логи
  // console.log('countDocumentsByScope: payload=', payload);
  
  const parsed = parseResult(payload);
  
  // логи
  // console.log('countDocumentsByScope: parsed=', parsed);
  
  // Проверка на число
  if (typeof parsed === 'number') {
    return parsed;
  }
  
  // Проверка на массив (для совместимости)
  if (Array.isArray(parsed) && typeof parsed[0] === 'number') {
    return parsed[0];
  }
  return 0;
};

export const listEmbeddedChunksByScope = async (scope: string, userId: number, limit = 400): Promise<SurrealEmbeddedChunk[]> => {
  const token = await ensureToken();

  // Если shared режим, не фильтруем по user_id
  const isSharedMode = scope === 'shared';
  const userFilter = isSharedMode ? '' : ` AND user_id = ${userId}`;

const sql = buildSqlWithNamespace(`SELECT id, doc_id, folder_name, content, embedding, chunk_index
               FROM filechunk
               WHERE scope = '${escapeSqlString(scope)}'${userFilter}
                 AND embedding_status = 'ready'
                 AND embedding != NONE
               LIMIT ${Math.max(1, Math.floor(limit))};`);

  // const sql = buildSqlWithNamespace(`SELECT id, doc_id, folder_name, content, embedding, chunk_index
  //              FROM filechunk
  //              WHERE scope = '${escapeSqlString(scope)}'
  //                AND user_id = ${userId}
  //                AND embedding_status = 'ready'
  //                AND embedding != NONE
  //              LIMIT ${Math.max(1, Math.floor(limit))};`);
  const payload = await execSql(sql, token);
  const parsed = parseResult(payload);

  console.log('listEmbeddedChunksByScope: parsed=', parsed);

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((row: any) => row && typeof row === 'object' && Array.isArray(row.embedding))
    .map((row: any) => ({
      id: String(row.id),
      doc_id: String(row.doc_id),
      folder_name: String(row.folder_name || 'Лекции'),
      content: String(row.content || ''),
      embedding: (row.embedding as any[]).map((v) => Number(v)).filter((v) => Number.isFinite(v)),
      chunk_index: Number(row.chunk_index || 0),
    }))
    .filter((row) => row.embedding.length > 0 && row.content.length > 0);
};

export const deleteFileDocument = async (documentId: string): Promise<void> => {
  const token = await ensureToken();
  const sql = buildSqlWithNamespace(`DELETE ${escapeSqlString(documentId)};`);
  await execSql(sql, token);
};

export const testSurrealConnection = async (): Promise<{ connected: boolean; details?: string }> => {
  try {
    const config = resolveSurrealConfig();
    const token = await signin(config);
    const payload = await execSql('RETURN "ok";', token);

    if (!payload.includes('ok')) {
      throw new Error('SurrealDB SQL ping returned unexpected response');
    }

    return {
      connected: true,
      details: `Connected to ${config.namespace}/${config.database}`,
    };
  } catch (error: any) {
    return {
      connected: false,
      details: error?.message || 'Unknown SurrealDB error',
    };
  }
};
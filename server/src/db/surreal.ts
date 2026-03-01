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
  originalName: string;
  mimeType: string;
  size: number;
  textContent: string;
  contentDigest: string;
  uploadedAtIso: string;
}

const normalizeBaseUrl = (rawUrl: string): string => {
  const withoutTrailingSlash = rawUrl.replace(/\/+$/, '');
  return withoutTrailingSlash.endsWith('/rpc')
    ? withoutTrailingSlash.slice(0, -4)
    : withoutTrailingSlash;
};

const resolveSurrealConfig = (): SurrealConfig => {
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

// export const upsertFileDocument = async (input: SurrealDocumentInput): Promise<void> => {
//   const token = await ensureToken();

//   const sql = `UPSERT ${input.id} CONTENT {
//     id: '${escapeSqlString(input.id)}',
//     scope: '${escapeSqlString(input.scope)}',
//     user_id: ${input.userId},
//     original_name: '${escapeSqlString(input.originalName)}',
//     mimetype: '${escapeSqlString(input.mimeType)}',
//     size: ${input.size},
//     text_content: '${escapeSqlString(input.textContent)}',
//     text_length: ${input.textContent.length},
//     content_digest: '${escapeSqlString(input.contentDigest)}',
//     uploaded_at: d'${escapeSqlString(input.uploadedAtIso)}',
//     status: 'indexed'
//   };`;
export const upsertFileDocument = async (input: SurrealDocumentInput): Promise<void> => {
  const token = await ensureToken();
  const config = resolveSurrealConfig();

  const ns = config.namespace;
  const db = config.database;

  const sql = `USE NS ${ns} DB ${db};
UPSERT ${input.id} CONTENT {
    scope: '${escapeSqlString(input.scope)}',
    user_id: ${input.userId},
    original_name: '${escapeSqlString(input.originalName)}',
    mimetype: '${escapeSqlString(input.mimeType)}',
    size: ${input.size},
    text_content: '${escapeSqlString(input.textContent)}',
    text_length: ${input.textContent.length},
    content_digest: '${escapeSqlString(input.contentDigest)}',
    uploaded_at: d'${escapeSqlString(input.uploadedAtIso)}',
    status: 'indexed'
  };`;

  // console.log('=== SurrealDB UPSERT SQL ===');
  // console.log(sql);
  // console.log('============================');  
  await execSql(sql, token);
};

export const deleteFileDocument = async (documentId: string): Promise<void> => {
  const token = await ensureToken();
  await execSql(`DELETE ${escapeSqlString(documentId)};`, token);
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

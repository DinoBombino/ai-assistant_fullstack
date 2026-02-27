import 'dotenv/config';

interface SurrealConfig {
  url: string;
  namespace: string;
  database: string;
  username: string;
  password: string;
}

const normalizeBaseUrl = (rawUrl: string): string => {
  const withoutTrailingSlash = rawUrl.replace(/\/+$/, '');
  return withoutTrailingSlash.endsWith('/rpc')
    ? withoutTrailingSlash.slice(0, -4)
    : withoutTrailingSlash;
};

const resolveSurrealConfig = (): SurrealConfig => {
  const url = process.env.SURREAL_URL || 'http://localhost:8000/rpc';

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

const pingSql = async (config: SurrealConfig, token: string): Promise<void> => {
  const response = await fetch(`${config.url}/sql`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'text/plain',
      Authorization: `Bearer ${token}`,
      NS: config.namespace,
      DB: config.database,
    },
    body: 'RETURN "ok";',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SurrealDB SQL ping failed (${response.status}): ${text}`);
  }

  const payload = await response.text();
  if (!payload.includes('ok')) {
    throw new Error('SurrealDB SQL ping returned unexpected response');
  }
};

export const testSurrealConnection = async (): Promise<{ connected: boolean; details?: string }> => {
  try {
    const config = resolveSurrealConfig();
    const token = await signin(config);
    await pingSql(config, token);

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

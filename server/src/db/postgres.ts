// server/src/db/postgres.ts
import 'dotenv/config'; 
import { Pool } from 'pg';

console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✓ Set' : '✗ Missing');
console.log('NODE_ENV:', process.env.NODE_ENV || 'Not set');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('connect', (client) => {
  console.log('✅ New PostgreSQL client connected');
});

pool.on('error', (err, client) => {
  console.error('❌ PostgreSQL client error:', err);
});

export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};

export const connectDB = async () => {
  try {
    console.log('🔄 Attempting to connect to PostgreSQL...');
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected successfully');
    
    const result = await client.query('SELECT version() as version, NOW() as current_time');
    console.log('📅 PostgreSQL version:', result.rows[0].version);
    console.log('🕒 Database time:', result.rows[0].current_time);
    
    client.release();
    
    // Инициализируем таблицы чата
    await initChatTables();
    
    return true;
  } catch (err: any) {
    console.error('❌ DB connection error:', err.message);
    console.error('Error details:', {
      code: err.code,
      detail: err.detail
    });
    return false;
  }
};

// Инициализация таблиц для чата
async function initChatTables() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Проверка таблиц чата...');
    
    // Таблица сессий чата
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) DEFAULT 'New Chat',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('✅ Таблица chat_sessions создана/проверена');

    // Таблица сообщений
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        tokens INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('✅ Таблица chat_messages создана/проверена');

    // Индексы
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)
    `);
    
    console.log('✅ Индексы созданы/проверены');
    
  } catch (error: any) {
    console.error('❌ Ошибка создания таблиц чата:', error.message);
  } finally {
    client.release();
  }
}

// Функции для работы с чатом
export const chatQueries = {
  // Создать новую сессию
  createSession: async (userId: number, title: string = 'New Chat') => {
    const result = await pool.query(
      `INSERT INTO chat_sessions (user_id, title) 
       VALUES ($1, $2) 
       RETURNING id, title, created_at`,
      [userId, title]
    );
    return result.rows[0];
  },

  // Получить сессии пользователя
  getUserSessions: async (userId: number) => {
    const result = await pool.query(
      `SELECT id, title, created_at, updated_at 
       FROM chat_sessions 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [userId]
    );
    return result.rows;
  },

  // Получить одну сессию по id
  getSessionById: async (sessionId: number) => {
    const result = await pool.query(
      `SELECT id, user_id, title, created_at, updated_at 
       FROM chat_sessions 
       WHERE id = $1`,
      [sessionId]
    );
    return result.rows[0] || null;
  },

  // Получить историю сообщений сессии
  getSessionMessages: async (sessionId: number, limit: number = 20) => {
    const result = await pool.query(
      `SELECT id, role, content, tokens, created_at 
       FROM chat_messages 
       WHERE session_id = $1 
       ORDER BY created_at ASC 
       LIMIT $2`,
      [sessionId, limit]
    );
    return result.rows;
  },

  // Добавить сообщение
  addMessage: async (sessionId: number, role: string, content: string, tokens?: number) => {
    const result = await pool.query(
      `INSERT INTO chat_messages (session_id, role, content, tokens) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, created_at`,
      [sessionId, role, content, tokens]
    );
    return result.rows[0];
  },

  // Обновить заголовок сессии
  updateSessionTitle: async (sessionId: number, title: string) => {
    const result = await pool.query(
      `UPDATE chat_sessions 
       SET title = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, title`,
      [title, sessionId]
    );
    return result.rows[0];
  },

  // Удалить сессию
  deleteSession: async (sessionId: number, userId: number) => {
    const result = await pool.query(
      'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2 RETURNING id',
      [sessionId, userId]
    );
    return result.rows[0];
  },

  // Проверить принадлежность сессии пользователю
  checkSessionOwnership: async (sessionId: number, userId: number) => {
    const result = await pool.query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );
    return result.rows.length > 0;
  }
};

export default pool;
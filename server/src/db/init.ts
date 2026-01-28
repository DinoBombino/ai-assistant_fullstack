// src/db/init.ts
import pool from './postgres';

export async function initTables() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Проверка и создание таблиц...');
    
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
    console.error('❌ Ошибка создания таблиц:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Запуск инициализации если файл запущен напрямую
if (require.main === module) {
  (async () => {
    try {
      await initTables();
      console.log('🎉 Инициализация БД завершена успешно!');
      process.exit(0);
    } catch (error) {
      console.error('❌ Инициализация БД не удалась');
      process.exit(1);
    }
  })();
}
import pool from './postgres';

async function checkTables() {
  const client = await pool.connect();
  try {
    console.log('🔍 Проверка таблиц...');
    
    // Проверяем таблицу users
    const usersResult = await client.query('SELECT COUNT(*) FROM users');
    console.log(`👤 Пользователей в базе: ${usersResult.rows[0].count}`);
    
    // Проверяем таблицу chat_sessions
    const sessionsResult = await client.query('SELECT COUNT(*) FROM chat_sessions');
    console.log(`💬 Сессий чата в базе: ${sessionsResult.rows[0].count}`);
    
    // Проверяем таблицу chat_messages
    const messagesResult = await client.query('SELECT COUNT(*) FROM chat_messages');
    console.log(`📨 Сообщений в базе: ${messagesResult.rows[0].count}`);
    
    // Показываем последние 5 сессий
    const recentSessions = await client.query(`
      SELECT s.id, s.title, u.email, COUNT(m.id) as message_count
      FROM chat_sessions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN chat_messages m ON s.id = m.session_id
      GROUP BY s.id, s.title, u.email
      ORDER BY s.created_at DESC
      LIMIT 5
    `);
    
    console.log('\n📊 Последние сессии:');
    if (recentSessions.rows.length > 0) {
      recentSessions.rows.forEach(session => {
        console.log(`  ID: ${session.id}, Заголовок: "${session.title}", Пользователь: ${session.email || 'unknown'}, Сообщений: ${session.message_count}`);
      });
    } else {
      console.log('  Нет сессий');
    }
    
    // Показываем последние 10 сообщений
    const recentMessages = await client.query(`
      SELECT m.id, m.role, m.content, s.title, m.created_at
      FROM chat_messages m
      LEFT JOIN chat_sessions s ON m.session_id = s.id
      ORDER BY m.created_at DESC
      LIMIT 10
    `);
    
    console.log('\n📝 Последние сообщения:');
    if (recentMessages.rows.length > 0) {
      recentMessages.rows.forEach(msg => {
        const preview = msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content;
        console.log(`  [${msg.role}] ${msg.created_at.toLocaleString()}: "${preview}" (Сессия: ${msg.title || 'без названия'})`);
      });
    } else {
      console.log('  Нет сообщений');
    }
    
  } catch (error) {
    console.error('❌ Ошибка при проверке таблиц:', error);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  checkTables().then(() => {
    console.log('\n✅ Проверка завершена');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  });
}

export { checkTables };
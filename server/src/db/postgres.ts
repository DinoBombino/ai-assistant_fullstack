// server/src/db/postgres.ts
// import dotenv from 'dotenv';
// dotenv.config();
import 'dotenv/config'; 

import { Pool } from 'pg';

console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✓ Set' : '✗ Missing', process.env.DATABASE_URL);
console.log('NODE_ENV:', process.env.NODE_ENV || 'Not set');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});


////////////////////////////
// // Явная конфигурация с отключением SASL
// const pool = new Pool({
//   host: 'localhost',
//   port: 5432,
//   database: 'ai_assistant',
//   user: 'postgres',
//   password: 'password123', // Явно указываем undefined вместо null
//   ssl: false,
//   connectionTimeoutMillis: 5000,
//   // Отключаем попытки SASL аутентификации
//   options: '-c client_encoding=utf8'
// });

// Убедимся, что пул создается правильно
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
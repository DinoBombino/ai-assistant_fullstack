-- server/database/init.sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT CHECK (role IN ('student', 'teacher', 'admin')) DEFAULT 'student',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Тестовый пользователь (опционально)
-- INSERT INTO users (email, password, name, role) 
-- VALUES ('admin@test.com', '$2b$10$...', 'Admin', 'admin');

-- Новая таблица для файлов
CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mimetype TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,  -- Сам файл (BLOB)
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
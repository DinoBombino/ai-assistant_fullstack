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
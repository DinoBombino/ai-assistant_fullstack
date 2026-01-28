/// <reference path="./types/index.d.ts" />
import 'dotenv/config'; 
import path from 'path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import filesRoutes from './routes/files.routes';
import chatRoutes from './routes/chat'; // изменили импорт
import bodyParser from "body-parser";
import { connectDB } from './db/postgres';

const app = express();
const PORT = process.env.PORT || 5000;

// CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(bodyParser.json());

// Логирование
app.use((req, res, next) => {
  console.log(`[HTTP] ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/chat', chatRoutes); // изменили эту строку

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'AI Assistant API',
    timestamp: new Date().toISOString()
  });
});

// Обслуживание статики фронтенда (если есть)
if (process.env.NODE_ENV === 'production') {
  const clientDistPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { details: err.message })
  });
});

// Запуск сервера
connectDB().then((success) => {
  if (success) {
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📊 AI Provider: ${process.env.AI_PROVIDER || 'openrouter'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🤖 Chat API: http://localhost:${PORT}/api/chat`);
    });
  } else {
    console.error('❌ Failed to connect to database. Exiting...');
    process.exit(1);
  }
});
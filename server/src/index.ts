import path from 'path';
import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 5000;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.namelomax.beget.tech/webhook/api/chat';

app.use(cors());
app.use(express.json());

// Раздаём статические файлы фронтенда
app.use(express.static(path.join(__dirname, '../../client/dist')));

// API для чата
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const n8nResponse = await axios.post(N8N_WEBHOOK_URL, {
      message: message.trim()
    }, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });

    const reply = n8nResponse.data?.contents?.[0]?.parts?.[0]?.reply || 'Нет ответа от AI';
    res.json({ success: true, reply, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Chat API error:', error);
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({ error: 'AI timeout' });
    }
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Любой другой запрос возвращает index.html (для SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

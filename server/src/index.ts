import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { tokenLimiter } from './middleware/tokenLimiter';

const app = express();
const PORT = process.env.PORT || 5000;

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../client/dist')));

// 🔐 Token limiter protects from 65k reservations and 402 errors
app.post('/api/chat', tokenLimiter({}), async (req, res) => {
  try {
    const { message, maxTokens, model } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY is missing' });
    }

    const chatModel = openrouter(model);

    const result = await generateText({
      model: chatModel,
      prompt: message.trim(),
      temperature: 0.7,

      // ✅ ВАЖНО: лимит токенов ТОЛЬКО ТАК для твоей версии SDK
      providerOptions: {
        openrouter: {
          max_tokens: maxTokens, // ✅ snake_case
        },
      },
    });

    res.json({ reply: result.text ?? 'No response' });
  } catch (err: any) {
    const status = err?.statusCode === 402 ? 402 : 500;
    console.error('AI error:', err?.message ?? err);

    res.status(status).json({
      error: err?.message ?? 'AI request failed',
    });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
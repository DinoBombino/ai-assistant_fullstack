// server/src/routes/chat.ts
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { chatQueries } from '../db/postgres';
import { aiService } from '../services/ai.service';

const router = Router();

interface ChatRequest {
  sessionId?: number | string;
  message: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  role?: string;
}

// Вспомогательная функция для преобразования sessionId в число
const parseSessionId = (sessionId: any): number | undefined => {
  if (sessionId === undefined || sessionId === null) return undefined;
  const num = Number(sessionId);
  return isNaN(num) ? undefined : num;
};

// Функция для создания системного промпта
const createSystemPrompt = (options: {
  userRole?: string;
  userMessage?: string;
  mode?: 'chat' | 'action';
} = {}) => {
  const { userRole = 'student', mode = 'chat' } = options;
  
  const basePrompt = `Ты полезный AI ассистент. Ты помогаешь пользователям с различными задачами.
Роль пользователя: ${userRole}
Будь вежливым, информативным и полезным. Отвечай на языке пользователя.`;

  if (mode === 'action' && options.userMessage?.includes('json')) {
    return `${basePrompt}
    Если пользователь запрашивает данные в формате JSON, возвращай валидный JSON.
    Структурируй ответы, когда это уместно.`;
  }

  return basePrompt;
};

// Получить сессии пользователя
router.get('/sessions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const sessions = await chatQueries.getUserSessions(req.user!.id);
    res.json({ success: true, sessions });
  } catch (error: any) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Получить историю сессии
router.get('/sessions/:sessionId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const sessionId = parseSessionId(req.params.sessionId);
    const userId = req.user!.id;

    if (!sessionId) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const hasAccess = await chatQueries.checkSessionOwnership(sessionId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await chatQueries.getSessionMessages(sessionId);
    res.json({ success: true, sessionId, messages });
  } catch (error: any) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Создать новую сессию
router.post('/sessions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    const session = await chatQueries.createSession(req.user!.id, title);
    res.json({ success: true, session });
  } catch (error: any) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Обновить заголовок сессии
router.patch('/sessions/:sessionId/title', authMiddleware, async (req: Request, res: Response) => {
  try {
    const sessionId = parseSessionId(req.params.sessionId);
    const { title } = req.body;
    const userId = req.user!.id;

    if (!sessionId) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    if (!title?.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const hasAccess = await chatQueries.checkSessionOwnership(sessionId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await chatQueries.updateSessionTitle(sessionId, title.trim());
    res.json({ success: true, session: updated });
  } catch (error: any) {
    console.error('Update title error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Удалить сессию
router.delete('/sessions/:sessionId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const sessionId = parseSessionId(req.params.sessionId);
    const userId = req.user!.id;

    if (!sessionId) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const deleted = await chatQueries.deleteSession(sessionId, userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true, message: 'Session deleted' });
  } catch (error: any) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Основной эндпоинт для чата
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sessionId, message, model, maxTokens, temperature, role }: ChatRequest = req.body;
    
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Получаем userId из авторизованного запроса
    const userId = req.user!.id;

    let actualSessionId: number;

    // Парсим sessionId если он есть
    const parsedSessionId = parseSessionId(sessionId);

    if (parsedSessionId) {
      const hasAccess = await chatQueries.checkSessionOwnership(parsedSessionId, userId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      actualSessionId = parsedSessionId;
    } else {
        let title = 'Новый чат';
        try {
          title = await aiService.generateTitle(message);
        } catch (error) {
          console.warn('Не удалось сгенерировать заголовок, используем по умолчанию');
          title = message.substring(0, 50) + '...';
        }
        const newSession = await chatQueries.createSession(userId, title);
        actualSessionId = newSession.id;
    }

    // Сохраняем сообщение пользователя
    await chatQueries.addMessage(actualSessionId, 'user', message);

    // Получаем историю для контекста (последние 10 сообщений без текущего)
    const history = await chatQueries.getSessionMessages(actualSessionId, 20);
    
    // Определяем режим (chat или action для JSON)
    const mode = /json/i.test(message) ? 'action' as const : 'chat' as const;
    
    // Создаем системный промпт как у коллеги
    const systemPrompt = createSystemPrompt({
      userRole: role || 'student',
      userMessage: message,
      mode
    });

    console.log('История сообщений для сессии', actualSessionId, ':', history.length, 'сообщений');
    
    // Подготавливаем сообщения для AI
    const aiMessages = [
      {
        role: 'system' as const,
        content: systemPrompt
      },
      ...history.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content
      }))
    ];

    console.log('Отправляем в AI', aiMessages.length, 'сообщений');

    // Получаем ответ от AI
    const aiResponse = await aiService.chat(aiMessages, {
      model,
      maxTokens: maxTokens || parseInt(process.env.DEFAULT_MAX_TOKENS || '512'),
      temperature,
      systemPrompt
    });

    // Сохраняем ответ ассистента
    await chatQueries.addMessage(
      actualSessionId, 
      'assistant', 
      aiResponse.content, 
      aiResponse.tokens
    );

    // Обновляем время сессии и, при необходимости, заголовок
    let updatedSessionTitle: string | undefined;
    const latestMessages = await chatQueries.getSessionMessages(actualSessionId, 1);
    if (latestMessages.length > 0) {
      const session = await chatQueries.getSessionById(actualSessionId);

      if (session && (session.title === 'Новый чат' || session.title === 'New Chat')) {
        const newTitle = latestMessages[0]?.content.substring(0, 100) || 'Chat';
        const updated = await chatQueries.updateSessionTitle(actualSessionId, newTitle);
        updatedSessionTitle = updated?.title;
      }
    }

    res.json({
      success: true,
      sessionId: actualSessionId,
      reply: aiResponse.content,
      provider: aiResponse.provider,
      tokens: aiResponse.tokens,
      finishReason: aiResponse.finishReason,
      timestamp: new Date().toISOString(),
      ...(updatedSessionTitle && { sessionTitle: updatedSessionTitle }),
    });

  } catch (error: any) {
    console.error('Chat error:', error);
    
    if (error.message?.includes('AI service error') || error.message?.includes('timeout')) {
      return res.status(503).json({ 
        error: "AI service temporarily unavailable",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    res.status(500).json({ 
      error: "Internal server error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check для AI
router.get('/health', async (req: Request, res: Response) => {
  try {
    const result = await aiService.testConnection();
    res.json({
      success: true,
      ai: {
        primaryProvider: process.env.AI_PROVIDER || 'fireworks',
        status: result.success ? 'healthy' : 'unavailable',
        workingProvider: result.provider || 'none',
        fireworks: process.env.FIREWORKS_API_KEY ? 'configured' : 'not configured',
        openai: process.env.OPENAI_API_KEY ? 'configured' : 'not configured',
        openrouter: process.env.OPENROUTER_API_KEY ? 'configured' : 'not configured'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'AI service check failed' 
    });
  }
});

export default router;
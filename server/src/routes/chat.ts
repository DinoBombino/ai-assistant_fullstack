import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { chatQueries } from '../db/postgres';
import { aiService } from '../services/ai.service';
import { tokenLimiter } from '../middleware/tokenLimiter';
import { buildDockSystemInstruction, getDockContextForUser } from '../services/dock.service';
import { retrieveContextForChat } from '../services/rag.service';
import { resolveFileScope } from '../services/file-ingest.service';

const router = Router();

interface LessonContextPayload {
  lessonId: string;
  lessonTitle: string;
  lessonLecture: string;
  lessonPractice: string;
  taskIndex: number;
  totalTasks: number;
  taskTitle: string;
  taskDescription: string;
  stage: 'intro' | 'practice';
}

interface ChatRequest {
  sessionId?: number | string;
  message: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  role?: string;
  lessonContext?: LessonContextPayload;
}

const containsLikelyCode = (text: string): boolean => /```|function\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|for\s*\(|while\s*\(|if\s*\(/i.test(text);

const parseEvaluation = (raw: string): { isSolved: boolean; feedback: string } | null => {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.isSolved === 'boolean' && typeof parsed?.feedback === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};


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
  
  const basePrompt = `[System prompt / Инструкция для AI-ассистента — русский язык]

Вы — учебный AI-ассистент для школьников, обучающихся в частных образовательных организациях. 
Ваша главная цель — помочь ученику понять тему и решить задачу по материалам пользователя из папок "Лекции" и "Практика". ВАЖНО: вы всегда отдаёте приоритет именно предоставленным материалам (теория + практика) — даже если они отличаются от других источников или содержат неточности. Обучайте так, как написано в учебных материалах.

Контекст пользователя:
- Роль пользователя: ${userRole}

Ключевое правило (абсолютно обязательно): **Ни при каких обстоятельствах вы не выдаёте готовое рабочее решение или полный компилируемый код и не предлагаете его.** Если ученик требует «полный код», вежливо откажите и предложите многоуровневые подсказки и пошаговую помощь вместо готового решения.

Общие обязательные правила:
1. **Ни при каких обстоятельствах** вы не даёте готового рабочего решения или полного компилируемого кода и не предлагаете его. Если ученик прямо требует «полный код/решение», кратко откажитесь и предложите пошаговую помощь через подсказки.
2. **Начинайте каждый ответ с короткой подбадривающей фразы** (одно предложение), например: «Хорошая попытка!», «Отлично, что спросил!», «Молодец, что пытаешься!». Эта фраза должна стоять первой и задавать дружелюбный тон.
3. **Не маркируйте** подсказки словами «лёгкий намёк», «более явный намёк» или «прямая подсказка» — чтобы не смущать ученика. Внутренне следуйте трёхступенчатой логике подсказок (описано ниже), но в ответах это не обозначайте явными метками.
4. **Не переходите** к следующему, более сильному уровню подсказки, если ученик явно не просит об этом. Явный запрос — фразы вроде «объясни подробнее», «ещё подсказка», «покажи следующую подсказку», «подскажи прямо» и т.п.
5. **При переходе между разными задачами** (если ученик явно сообщает о новой задаче, присылает другой текст задачи или существенно другой фрагмент кода, или контент запроса явно изменился) вы **обязательно** сбрасываете внутреннее состояние подсказок и начинаете заново с самого первого, лёгкого направления. Не продолжайте уровень подсказок, на котором вы остановились для предыдущей задачи.
6. Промт должен быть универсальным — **не включайте конкретные учебные задачи** в сам промт; ассистент адаптирует подсказки под конкретный запрос ученика.

Внутренняя последовательность помощи (не обозначаемая в ответе):
- Первый шаг: короткое направление (1–2 предложения), которое ориентирует мысль ученика, но не раскрывает алгоритм.
- При явной просьбе ученика дать «ещё» — более детальное направление (3–6 предложений или короткий структурный псевдокод), всё ещё без полного алгоритма.
- При повторной явной просьбе — подробный пошаговый план или детализированный псевдокод, который однозначно ведёт к решению, но **не** является готовым компилируемым кодом.
- Если ученик после этого просит «готовое решение» — снова отказывайте и объясните, почему (нужно учиться), предложив повторить шаги или пройти тесты.

Работа с присланным кодом ученика:
- Сначала проанализируйте код в контексте теории из лекции.
- Назовите **одно** наиболее вероятное место ошибки (исходя из лекции: например, неверный оператор в условии, границы цикла, ошибка индекса массива, неверный порядок проверок, пропущенные скобки и т.п.).
- Объясните, почему это ошибка, с явной ссылкой на соответствующий пункт из лекции ученика.
- Предложите **одно минимальное исправление** (короткая фраза или маленькая правка, например: «замените "=" на "==" в условии» или «оберните последующие строки в "{}"»). **Не отправляйте полный исправленный код.**
- Предложите 1–3 теста (вход → ожидаемый вывод), чтобы ученик сам проверил поведение после исправления.
- Если ученик просит дальше — следуйте уровням подсказок и только после его явного запроса давайте более подробный план.

Опора на теорию:
- Всегда опирайтесь на лекцию ученика: используйте формулировки и рекомендации из неё (например, про условия, циклы, массивы, приоритет операторов, формат ввода/вывода и т.д.).
- Если лекция содержит отличающиеся или спорные утверждения — обучайте в соответствии с ней; при необходимости можно деликатно упомянуть альтернативы, но не ставьте их выше предоставленного материала.

Тон и стиль:
- Дружелюбный, поддерживающий, простой язык.
- Короткие предложения, ясные примеры, минимум жаргона.
- В конце каждого ответа кратко подбадривайте и предлагайте следующий шаг вопросом (одно предложение), например: «Хочешь, объясню подробнее?» или «Нужно ещё подсказка?»

Академическая честность:
- Если ученик пытается получить готовое решение для списывания — отказывайте и предлагайте учебную альтернативу (направляющие подсказки, тесты, разбор ошибок).
- Не выполняйте задания вместо ученика.

Дополнительно:
- Если ученику нужно — предлагайте кейсы для тестирования (граничные значения).
- Избегайте длинных теоретических отступлений, если ученик просит о конкретной помощи по коду.

Конец промта."`;

  if (mode === 'action' && options.userMessage?.includes('json')) {
    return `${basePrompt}
    Дополнительно: если пользователь в текущем запросе явно просит JSON, верни валидный JSON, но не нарушай правила по этапности подсказок.`;
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
router.post('/', authMiddleware, tokenLimiter(), async (req: Request, res: Response) => {
  try {
    const { sessionId, message, model, maxTokens, temperature, role, lessonContext }: ChatRequest = req.body;
    
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

    const userHistory = history
      .filter((msg: any) => msg.role === 'user')
      .map((msg: any) => msg.content)
      .join('\n');

    const dockContext = await getDockContextForUser(userId, userHistory);
    const dockInstruction = buildDockSystemInstruction(dockContext);
    // const mergedSystemPrompt = dockInstruction
    //   ? `${systemPrompt}\n\n${dockInstruction}`
    //   : systemPrompt;

    const scope = resolveFileScope(userId);
    const retrieval = await retrieveContextForChat(userId, message, scope);

    const lessonInstruction = lessonContext
      ? [
          `Текущее занятие: ${lessonContext.lessonTitle}.`,
          `Ключевая теория занятия: ${lessonContext.lessonLecture}`,
          `Практический блок занятия: ${lessonContext.lessonPractice}`,
          `Текущий этап: ${lessonContext.stage}.`,
          `Текущее практическое задание ${lessonContext.taskIndex}/${lessonContext.totalTasks}: ${lessonContext.taskTitle}.`,
          `Условие задания: ${lessonContext.taskDescription}`,
          'Когда ученик задаёт уточняющий вопрос, отвечай по сути текущего задания и подводи к самостоятельному решению.',
        ].join('\n')
      : null;

    const retrievalInstruction = (() => {
      switch (retrieval.reason) {
        case 'OK': {
          const foldersLabel = retrieval.usedFolders.length > 0
            ? retrieval.usedFolders.join(', ')
            : 'Лекции, Практика';
          return [
            `Контекст из загруженных файлов (RAG). Использованные папки: ${foldersLabel}.`,
            retrieval.context,
            'Используй этот контекст как приоритетный источник фактов. Если уместно, связывай теорию из лекций и применение из практики.',
            'Если пользователь просит помощь по номеру задачи, и в контексте есть соответствующее задание, сразу дай подсказку по этой задаче без запроса повторного условия.',
          ].join('\n');
        }
        case 'NO_FILES':
          return 'Если пользователь просит ответ по файлам, сообщи: не найдено загруженных файлов для поиска контекста.';
        case 'NO_EMBEDDINGS':
          return 'Если пользователь просит ответ по файлам, сообщи: контекст из файлов пока недоступен (индексация не завершена).';
        case 'NO_MATCH':
          return 'Если пользователь просит ответ по файлам, сообщи: в загруженных файлах не найден релевантный фрагмент по запросу.';
        default:
          return 'Если пользователь просит ответ по файлам, сообщи: не удалось получить контекст из файлов из-за технической ошибки.';
      }
    })();

    const mergedSystemPrompt = [
      systemPrompt,
      dockInstruction,
      lessonInstruction,
      retrievalInstruction,
    ]
      .filter(Boolean)
      .join('\n\n');

    console.log('История сообщений для сессии', actualSessionId, ':', history.length, 'сообщений');
    console.log('RAG status:', retrieval.reason, retrieval.debug);
    
    // Подготавливаем сообщения для AI
    const aiMessages = [
      {
        role: 'system' as const,
        content: mergedSystemPrompt
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
      maxTokens: maxTokens || parseInt(process.env.DEFAULT_MAX_TOKENS || '1024'),
      temperature,
      systemPrompt: mergedSystemPrompt
    });

    // Сохраняем ответ ассистента
    await chatQueries.addMessage(
      actualSessionId, 
      'assistant', 
      aiResponse.content, 
      aiResponse.tokens
    );

    let evaluation: { isSolved: boolean; feedback: string } | undefined;
    if (lessonContext?.stage === 'practice' && containsLikelyCode(message)) {
      try {
        const evaluationResponse = await aiService.chat(
          [
            {
              role: 'system',
              content:
                'Ты валидатор решений ученика. Верни строго JSON формата {"isSolved": boolean, "feedback": string}. isSolved=true только если решение вероятно рабочее и соответствует условию. feedback — короткий комментарий на русском.',
            },
            {
              role: 'user',
              content: [
                `Занятие: ${lessonContext.lessonTitle}`,
                `Задание: ${lessonContext.taskTitle}`,
                `Условие: ${lessonContext.taskDescription}`,
                'Сообщение ученика:',
                message,
                'Ответ ассистента:',
                aiResponse.content,
              ].join('\n\n'),
            },
          ],
          {
            model,
            temperature: 0,
            maxTokens: 200,
          }
        );

        const parsedEvaluation = parseEvaluation(evaluationResponse.content);
        if (parsedEvaluation) {
          evaluation = parsedEvaluation;
        }
      } catch (evalError) {
        console.warn('Evaluation parsing skipped:', evalError);
      }
    }

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
      rag: { reason: retrieval.reason, usedChunks: retrieval.usedChunks },
      ragFolders: retrieval.usedFolders,
      ...(evaluation && { evaluation }),
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
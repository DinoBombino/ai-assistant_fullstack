import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { chatQueries } from '../db/postgres';
import { aiService } from '../services/ai.service';
import { tokenLimiter } from '../middleware/tokenLimiter';
import { buildDockSystemInstruction, getDockContextForUser } from '../services/dock.service';
import { retrieveContextForChat } from '../services/rag.service';
import { resolveFileScope } from '../services/file-ingest.service';

const router = Router();

interface ChatRequest {
  sessionId?: number | string;
  message: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  role?: string;
}

type ChatHistoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type HintStage = 1 | 2 | 3;

// Вспомогательная функция для преобразования sessionId в число
const parseSessionId = (sessionId: any): number | undefined => {
  if (sessionId === undefined || sessionId === null) return undefined;
  const num = Number(sessionId);
  return isNaN(num) ? undefined : num;
};

const ESCALATION_REQUEST_PATTERNS = [
  /ещ[её]\s+подсказк/i,
  /подробн/i,
  /конкретн/i,
  /следующ(ий|ая|ее)\s+шаг/i,
  /давай\s+прям/i,
  /покажи\s+псевдокод/i,
  /next\s+hint/i,
  /more\s+details/i,
];

const NEW_TASK_PATTERNS = [
  /нов(ая|ое|ый)\s+задач/i,
  /другая\s+задач/i,
  /нов(ый|ое)\s+вопрос/i,
  /перейд(е|ё)м\s+к\s+другой/i,
  /следующ(ая|ий)\s+задач/i,
  /^\s*условие\s*:/i,
  /формат\s+ввода/i,
  /формат\s+вывода/i,
  /(напиши|написать|реализуй|реализовать)\s+программ/i,
  /реши\s+задач/i,
];

const FOLLOW_UP_PATTERNS = [
  /не\s+понима/i,
  /объясн/i,
  /подробн/i,
  /ещ[её]/i,
  /поподробнее/i,
  /можешь/i,
  /как\s+решить/i,
  /псевдокод/i,
];

const asksForEscalation = (message: string): boolean => {
  const normalized = message.trim();
  return ESCALATION_REQUEST_PATTERNS.some((pattern) => pattern.test(normalized));
};

const isNewTaskMessage = (message: string): boolean => {
  const normalized = message.trim();
  return NEW_TASK_PATTERNS.some((pattern) => pattern.test(normalized));
};

const isFollowUpMessage = (message: string): boolean => {
  const normalized = message.trim();
  return FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(normalized));
};

const extractKeywords = (message: string): string[] => {
  return message
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
};

const hasSubstantialTopicShift = (previousMessage: string, nextMessage: string): boolean => {
  const prevTokens = extractKeywords(previousMessage);
  const nextTokens = extractKeywords(nextMessage);

  if (prevTokens.length < 3 || nextTokens.length < 3) {
    return false;
  }

  const prevSet = new Set(prevTokens);
  const nextSet = new Set(nextTokens);
  const overlap = [...nextSet].filter((token) => prevSet.has(token)).length;
  const overlapRatio = overlap / nextSet.size;

  return overlapRatio < 0.2;
};

const startsLikelyNewQuestion = (message: string): boolean => {
  return /^\s*(что|как|почему|зачем|где|когда|напиши|написать|реализуй|реализовать|условие)\b/i.test(message.trim());
};

const isNewTaskBoundary = (previousUserMessage: string | null, currentUserMessage: string): boolean => {
  if (isNewTaskMessage(currentUserMessage)) {
    return true;
  }

  if (!previousUserMessage) {
    return false;
  }

  if (asksForEscalation(currentUserMessage) || isFollowUpMessage(currentUserMessage)) {
    return false;
  }

  return hasSubstantialTopicShift(previousUserMessage, currentUserMessage) && startsLikelyNewQuestion(currentUserMessage);
};

const calculateCurrentHintStage = (history: ChatHistoryMessage[], currentUserMessage: string): HintStage => {
  let stage: HintStage = 1;
  let previousUserMessage: string | null = null;

  for (let i = 0; i < history.length; i += 1) {
    const message = history[i];
    if (message.role !== 'user') continue;

    if (isNewTaskBoundary(previousUserMessage, message.content)) {
      stage = 1;
    } else if (asksForEscalation(message.content) && stage < 3) {
      stage = (stage + 1) as HintStage;
    }

    previousUserMessage = message.content;
  }

  if (isNewTaskBoundary(previousUserMessage, currentUserMessage)) {
    return 1;
  }

  if (asksForEscalation(currentUserMessage) && stage < 3) {
    return (stage + 1) as HintStage;
  }

  return stage;
};

const createHintStageInstruction = (stage: HintStage): string => {
  const stageRules = [
    'Детерминированное состояние этапа подсказки для ТЕКУЩЕГО ответа:',
    `- Текущий этап помощи: ${stage}.`,
    '- Это состояние является приоритетным и обязательным для данного ответа.',
    '- Запрещено переходить на более сильный этап без явного запроса пользователя внутри этой же задачи.',
  ];

  if (stage === 1) {
    stageRules.push(
      '- Этап 1: только короткий намёк (1–2 предложения) без шагов алгоритма.',
      '- Этап 1: запрещены псевдокод, нумерованные шаги, детальный план и готовые формулы решения.',
    );
  } else if (stage === 2) {
    stageRules.push(
      '- Этап 2: средняя подсказка (3–6 предложений), но без псевдокода.',
      '- Этап 2: запрещены заголовок «Псевдокод» и пошаговый нумерованный алгоритм.',
    );
  } else {
    stageRules.push('- Этап 3: дайте псевдокод строго в требуемом формате из системного промта.');
  }

  return stageRules.join('\n');
};

const USER_MESSAGE_TUTORING_REMINDER = 'Напоминание ассистенту: ты учебный помощник, не пишешь готовый код и не даёшь компилируемое решение; помогаешь обучающими подсказками по этапам.';

const withTutoringReminder = (userMessage: string): string => {
  return `${userMessage}\n\n${USER_MESSAGE_TUTORING_REMINDER}`;
};

const containsCodeLikeSolution = (response: string): boolean => {
  const codeLikePatterns = [
    /#include\s*</i,
    /\busing\s+namespace\b/i,
    /\bint\s+main\s*\(/i,
    /\bpublic\s+static\s+void\s+main\s*\(/i,
    /\bdef\s+\w+\s*\(/i,
    /```[\s\S]*```/m,
  ];

  if (codeLikePatterns.some((pattern) => pattern.test(response))) {
    return true;
  }

  const lines = response.split('\n').map((line) => line.trim());
  const codeLikeLines = lines.filter((line) =>
    /[{};]/.test(line) &&
    /(\bif\b|\belse\b|\bwhile\b|\bfor\b|\breturn\b|=)/i.test(line)
  ).length;

  return codeLikeLines >= 3;
};

const violatesHintStage = (response: string, stage: HintStage): boolean => {
  const hasPseudocodeHeader = /псевдокод/i.test(response);
  const numberedItems = response.match(/^\s*\d+[.)]\s+/gm)?.length ?? 0;

  if (containsCodeLikeSolution(response)) {
    return true;
  }

  if (stage === 1) {
    return hasPseudocodeHeader || numberedItems >= 2;
  }

  if (stage === 2) {
    return hasPseudocodeHeader;
  }

  return false;
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
7. **Никогда не предлагайте написать/показать готовую реализацию в коде** («могу дать код», «давай реализуем в C++», и т.п.). Вместо этого предлагайте следующий учебный шаг: намёк, разбор ошибки, тест-кейс или псевдокод по правилам этапа.


Управление этапами подсказок (обязательно, даже в длинном диалоге):
- Отслеживайте этап помощи по истории текущей задачи и не «забывайте» прогрессию уровней.
- Считайте, что этап хранится в контексте чата: определяйте его по последнему вашему ответу в рамках той же задачи.
- Переходите на следующий этап только по явному запросу ученика («ещё подсказка», «подробнее», «следующий шаг», «давай конкретнее» и т.п.).
- Если явного запроса нет — оставайтесь на текущем этапе или мягко переформулируйте его, не усиливая помощь.
- Сбрасывайте этап на первый только при новой задаче (новое условие/другой код/явный переход к другой теме).

Внутренняя последовательность помощи (не обозначаемая в ответе):
- Этап 1 (лёгкий намёк): короткое направление (1–2 предложения), которое ориентирует мысль ученика, но не раскрывает алгоритм.
- Этап 2 (средний намёк): более детальное направление (3–6 предложений), с упором на идею и ключевые проверки, но без полного алгоритма.
- Этап 3 (псевдокод): детализированный пошаговый псевдокод, который однозначно ведёт к решению, но **не** является готовым компилируемым кодом.
- Если ученик после этапа 3 просит «готовое решение» — снова отказывайте и объясняйте, почему (нужно учиться), предложив разобрать шаги/тесты.

Формат этапа 3 (псевдокод обязателен именно в таком виде):
- Давайте блок с заголовком «Псевдокод» и нумерованными шагами.
- Каждый шаг должен быть абстрактным (описание действий), без синтаксиса конкретного языка.
- Разрешены только универсальные конструкции: «ввод», «если», «иначе», «пока/для каждого», «вычислить», «вывести».
- Запрещено использовать языковые детали (типы, импорты, точные названия библиотек, сигнатуры функций, компилируемые фрагменты).
- После псевдокода добавляйте 1–2 коротких теста в формате «вход → ожидаемый результат».

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

    // Получаем историю до сохранения текущего сообщения
    const history = await chatQueries.getSessionMessages(actualSessionId, 20);
    const hintStage = calculateCurrentHintStage(history as ChatHistoryMessage[], message);
    const hintStageInstruction = createHintStageInstruction(hintStage);
    // Сохраняем сообщение пользователя
    await chatQueries.addMessage(actualSessionId, 'user', message);

    const historyWithCurrent: ChatHistoryMessage[] = [
      ...(history as ChatHistoryMessage[]),
      { role: 'user', content: message },
    ];
    
    // Определяем режим (chat или action для JSON)
    const mode = /json/i.test(message) ? 'action' as const : 'chat' as const;
    
    // Создаем системный промпт как у коллеги
    const systemPrompt = createSystemPrompt({
      userRole: role || 'student',
      userMessage: message,
      mode
    });

    const userHistory = historyWithCurrent
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
      hintStageInstruction,
      dockInstruction,
      retrievalInstruction,
    ]
      .filter(Boolean)
      .join('\n\n');

    console.log('История сообщений для сессии', actualSessionId, ':', history.length, 'сообщений');
    console.log('RAG status:', retrieval.reason, retrieval.debug);
    console.log('Hint stage:', hintStage);
    
    // Подготавливаем сообщения для AI
    const aiMessages = [
      {
        role: 'system' as const,
        content: mergedSystemPrompt
      },
      ...historyWithCurrent.map((msg: any) => {
        const role = msg.role as 'user' | 'assistant' | 'system';
        if (role === 'user') {
          return {
            role,
            content: withTutoringReminder(msg.content),
          };
        }

        return {
          role,
          content: msg.content,
        };
      })
    ];

    console.log('Отправляем в AI', aiMessages.length, 'сообщений');

    // Получаем ответ от AI
    let aiResponse = await aiService.chat(aiMessages, {
      model,
      maxTokens: maxTokens || parseInt(process.env.DEFAULT_MAX_TOKENS || '1024'),
      temperature,
      systemPrompt: mergedSystemPrompt
    });

    if (violatesHintStage(aiResponse.content, hintStage)) {
      const correctionInstruction = [
        'Предыдущий ответ нарушил ограничение этапа подсказки.',
        `Сформируй ответ заново строго для этапа ${hintStage}.`,
        'Не упоминай факт исправления и не ссылайся на предыдущее нарушение.',
      ].join('\n');

      aiResponse = await aiService.chat(aiMessages, {
        model,
        maxTokens: maxTokens || parseInt(process.env.DEFAULT_MAX_TOKENS || '1024'),
        temperature,
        systemPrompt: `${mergedSystemPrompt}\n\n${correctionInstruction}`,
      });
    }

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
      rag: { reason: retrieval.reason, usedChunks: retrieval.usedChunks },
      ragFolders: retrieval.usedFolders,
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
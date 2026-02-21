import { query } from '../db/postgres';

interface DockTask {
  index: number;
  instruction: string;
  transitionPhrase?: string;
}

interface ActiveDockContext {
  activeTask?: DockTask;
  tasks: DockTask[];
  sourceFiles: string[];
}

const splitTasks = (raw: string): DockTask[] => {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const numbered = normalized.split(/\n(?=\s*\d+\s*[).:-]\s*)/g).filter(Boolean);
  const chunks = numbered.length > 1 ? numbered : [normalized];
  const tasks: DockTask[] = [];

  chunks.forEach((chunk, idx) => {
    const instruction = chunk.replace(/^\s*\d+\s*[).:-]\s*/m, '').trim();
    if (!instruction) return;

    const transitionPhrase = extractTransitionPhrase(instruction);
    tasks.push({
      index: idx + 1,
      instruction,
      transitionPhrase,
    });
  });

  return tasks;
};

const extractTransitionPhrase = (instruction: string): string | undefined => {
  const quotedPhraseMatch = instruction.match(/(?:ключев\w*\s+фраз\w*|после\s+фраз\w*)[^"\n]*"([^"]+)"/iu);
  if (quotedPhraseMatch?.[1]) {
    return quotedPhraseMatch[1].trim();
  }

  const singleQuoteMatch = instruction.match(/(?:ключев\w*\s+фраз\w*|после\s+фраз\w*)[^'\n]*'([^']+)'/iu);
  if (singleQuoteMatch?.[1]) {
    return singleQuoteMatch[1].trim();
  }

  return undefined;
};

const normalizeForSearch = (text: string): string => text.toLocaleLowerCase('ru-RU');

const selectActiveTask = (tasks: DockTask[], userHistory: string): DockTask | undefined => {
  if (tasks.length === 0) return undefined;

  const searchableHistory = normalizeForSearch(userHistory);
  let currentIndex = 0;

  while (currentIndex < tasks.length - 1) {
    const task = tasks[currentIndex];
    if (!task.transitionPhrase) {
      break;
    }

    const transitionHit = searchableHistory.includes(normalizeForSearch(task.transitionPhrase));
    if (!transitionHit) {
      break;
    }

    currentIndex += 1;
  }

  return tasks[currentIndex];
};

export const getDockContextForUser = async (userId: number, userHistory: string): Promise<ActiveDockContext> => {
  const result = await query(
    `SELECT original_name, data
       FROM files
      WHERE user_id = $1
        AND LOWER(original_name) LIKE '%.dock'
      ORDER BY uploaded_at DESC`,
    [userId]
  );

  if (result.rows.length === 0) {
    return { tasks: [], sourceFiles: [] };
  }

  const sourceFiles: string[] = [];
  const tasks: DockTask[] = [];

  result.rows.forEach((row: { original_name: string; data: Buffer }) => {
    const content = row.data.toString('utf-8');
    const parsedTasks = splitTasks(content);

    if (parsedTasks.length > 0) {
      sourceFiles.push(row.original_name);
      tasks.push(...parsedTasks);
    }
  });

  const activeTask = selectActiveTask(tasks, userHistory);
  return { activeTask, tasks, sourceFiles };
};

export const buildDockSystemInstruction = (dockContext: ActiveDockContext): string | null => {
  if (!dockContext.activeTask) {
    return null;
  }

  const transitions = dockContext.tasks
    .filter((task) => task.transitionPhrase)
    .map((task) => `- После фразы "${task.transitionPhrase}" переходи к заданию ${task.index + 1}.`)
    .join('\n');

  return [
    `Дополнительные правила взяты из .dock файлов пользователя (${dockContext.sourceFiles.join(', ')}).`,
    'Строго соблюдай только активное задание ниже и игнорируй предыдущие после перехода:',
    `Активное задание ${dockContext.activeTask.index}: ${dockContext.activeTask.instruction}`,
    transitions ? `Правила перехода:\n${transitions}` : null,
  ]
    .filter(Boolean)
    .join('\n');
};
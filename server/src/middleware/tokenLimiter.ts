// server/src/middleware/tokenLimiter.updated.ts
// Updated token limiter that uses openai model defaults (gpt-4o-mini) and conservative contexts.
// Usage: import { tokenLimiter } from './middleware/tokenLimiter.updated';

import { Request, Response, NextFunction } from 'express';

const DEFAULT_MAX_TOKENS = Number(process.env.DEFAULT_MAX_TOKENS) || 1024;
const MAX_ALLOWED_TOKENS = Number(process.env.MAX_ALLOWED_TOKENS) || 12000;
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'openai/gpt-4o-mini';

// Known model context sizes (conservative estimates)
const MODEL_MAX_CONTEXT: Record<string, number> = {
  'minimax/minimax-m2.5:free': 64000,
  'openai/gpt-5-mini': 128000,
  'openai/gpt-4o-mini': 128000,
  'openai/gpt-4o': 128000,
  'deepseek/deepseek-r1-0528:free': 64000,
  // other models default to server cap if unknown
};

export interface TokenLimiterOptions {
  defaultMax?: number;
  maxAllowed?: number;
  modelId?: string;
}

export function tokenLimiter(opts?: TokenLimiterOptions) {
  const defaultMax = opts?.defaultMax ?? DEFAULT_MAX_TOKENS;
  const maxAllowed = opts?.maxAllowed ?? MAX_ALLOWED_TOKENS;
  const modelDefault = opts?.modelId ?? DEFAULT_MODEL;

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawRequested = req.body?.maxTokens ?? req.query?.maxTokens ?? defaultMax;
      const requested = Number(rawRequested) || defaultMax;

      const modelId = (req.body?.model as string) || modelDefault;
      const modelContext = MODEL_MAX_CONTEXT[modelId] ?? maxAllowed;

      const clamped = Math.max(1, Math.min(requested, modelContext, maxAllowed));

      req.body = { ...req.body, maxTokens: clamped, model: modelId };

      console.log(`[tokenLimiter] model=${modelId} requested=${requested} clamped=${clamped} (modelContext=${modelContext} allowed=${maxAllowed})`);

      next();
    } catch (err) {
      next(err);
    }
  };
}
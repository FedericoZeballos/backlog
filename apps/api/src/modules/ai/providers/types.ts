import type { AIProviderName } from '@backlog/shared';
import type { z } from 'zod';
import { AppError } from '../../../lib/errors';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateRequest<T> {
  /** Stable name of the output contract (also used by the fake provider). */
  task: 'assistant_turn' | 'plan_proposal' | 'recommendation';
  system: string;
  messages: ChatMessage[];
  schema: z.ZodType<T>;
}

export interface GenerateResult<T> {
  data: T;
  durationMs: number;
}

/**
 * A model that returns JSON matching a schema. Business logic only sees this
 * interface, so switching providers does not touch it.
 */
export interface LLMProvider {
  readonly name: AIProviderName;
  readonly model: string;
  generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>>;
}

export type AIErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'MODEL_NOT_FOUND'
  | 'NOT_CONFIGURED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INVALID_OUTPUT'
  | 'REFUSED'
  | 'PROVIDER_ERROR';

const STATUS: Record<AIErrorCode, number> = {
  PROVIDER_UNAVAILABLE: 503,
  MODEL_NOT_FOUND: 503,
  NOT_CONFIGURED: 503,
  TIMEOUT: 504,
  RATE_LIMITED: 429,
  INVALID_OUTPUT: 502,
  REFUSED: 422,
  PROVIDER_ERROR: 502,
};

/** Provider failures. They never leave partial data: nothing is saved when one is thrown. */
export class AIError extends AppError {
  constructor(code: AIErrorCode, message: string, details?: unknown) {
    super(STATUS[code], `AI_${code}`, message, details);
  }
}

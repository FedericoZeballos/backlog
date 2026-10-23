import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AIError, type GenerateRequest, type GenerateResult, type LLMProvider } from './types';

/**
 * Claude with structured outputs. Server-side fallbacks are enabled so a safety
 * decline is retried on another model instead of failing outright.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'ANTHROPIC' as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    timeoutMs: number,
  ) {
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 2 });
  }

  async generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const started = Date.now();
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: req.system,
        messages: req.messages,
        output_config: { format: zodOutputFormat(req.schema), effort: 'medium' },
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new AIError('NOT_CONFIGURED', 'La clave de Anthropic no es válida.');
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new AIError('RATE_LIMITED', 'Se alcanzó el límite de uso de la API de Claude. Probá en unos minutos.');
      }
      if (err instanceof Anthropic.APIConnectionTimeoutError) {
        throw new AIError('TIMEOUT', 'Claude tardó demasiado en responder.');
      }
      if (err instanceof Anthropic.APIConnectionError) {
        throw new AIError('PROVIDER_UNAVAILABLE', 'No se pudo conectar con la API de Claude.');
      }
      if (err instanceof Anthropic.APIError) {
        throw new AIError('PROVIDER_ERROR', `La API de Claude respondió con un error (${err.status}).`);
      }
      throw err;
    }

    if (response.stop_reason === 'refusal') {
      throw new AIError('REFUSED', 'El modelo no quiso responder este pedido.');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new AIError('INVALID_OUTPUT', 'La respuesta quedó cortada. Probá de nuevo.');
    }
    const parsed = req.schema.safeParse(response.parsed_output);
    if (!parsed.success) throw new AIError('INVALID_OUTPUT', 'Claude devolvió una respuesta con formato inválido.');
    return { data: parsed.data, durationMs: Date.now() - started };
  }
}

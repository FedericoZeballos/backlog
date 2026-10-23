import { z } from 'zod';
import { AIError, type GenerateRequest, type GenerateResult, type LLMProvider } from './types';

interface OllamaOptions {
  baseUrl: string;
  model: string;
  numCtx: number;
  timeoutMs: number;
}

interface OllamaChatResponse {
  message?: { content?: string };
  done_reason?: string;
  error?: string;
}

/** Local models through Ollama's /api/chat with a JSON-schema constrained `format`. */
export class OllamaProvider implements LLMProvider {
  readonly name = 'OLLAMA' as const;
  readonly model: string;

  constructor(private readonly opts: OllamaOptions) {
    this.model = opts.model;
  }

  async generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const started = Date.now();
    const format = z.toJSONSchema(req.schema);
    const messages = [{ role: 'system', content: req.system }, ...req.messages];

    // One retry with the validation error when the output does not match the contract.
    let lastError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.chat(
        attempt === 0
          ? messages
          : [
              ...messages,
              {
                role: 'user',
                content: `Tu respuesta anterior no cumplía el formato (${lastError}). Respondé de nuevo solo con el JSON pedido.`,
              },
            ],
        format,
      );
      try {
        const data = req.schema.parse(JSON.parse(raw));
        return { data, durationMs: Date.now() - started };
      } catch (err) {
        lastError = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : 'JSON inválido';
      }
    }
    throw new AIError('INVALID_OUTPUT', 'El modelo devolvió una respuesta con formato inválido. Probá de nuevo.', { lastError });
  }

  private async chat(messages: { role: string; content: string }[], format: unknown): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.opts.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          format,
          stream: false,
          keep_alive: '15m',
          options: { temperature: 0.2, num_ctx: this.opts.numCtx },
        }),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new AIError('TIMEOUT', 'El modelo local tardó demasiado en responder.');
      }
      throw new AIError('PROVIDER_UNAVAILABLE', 'No se pudo conectar con Ollama. ¿Está abierto en esta computadora?');
    }

    const body = (await res.json().catch(() => ({}))) as OllamaChatResponse;
    if (!res.ok) {
      if (res.status === 404 || /not found/i.test(body.error ?? '')) {
        throw new AIError('MODEL_NOT_FOUND', `El modelo "${this.model}" no está instalado en Ollama (ollama pull ${this.model}).`);
      }
      throw new AIError('PROVIDER_ERROR', `Ollama respondió con un error: ${body.error ?? res.status}`);
    }
    const content = body.message?.content;
    if (!content) throw new AIError('INVALID_OUTPUT', 'Ollama devolvió una respuesta vacía.');
    return content;
  }

  /** Installed model names, or null if Ollama is not reachable. */
  static async listModels(baseUrl: string): Promise<string[] | null> {
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3_000) });
      if (!res.ok) return null;
      const body = (await res.json()) as { models?: { name: string }[] };
      return (body.models ?? []).map((m) => m.name);
    } catch {
      return null;
    }
  }
}

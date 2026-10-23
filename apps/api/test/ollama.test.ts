import { AssistantTurnOutput } from '@backlog/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OllamaProvider } from '../src/modules/ai/providers/ollama';

// A stand-in for Ollama's HTTP API, so the provider is tested without a real model.
let server: FastifyInstance;
let baseUrl: string;
let replies: { status: number; body: unknown }[] = [];
let received: Record<string, unknown>[] = [];

beforeAll(async () => {
  server = Fastify();
  server.post('/api/chat', async (req, reply) => {
    received.push(req.body as Record<string, unknown>);
    const next = replies.shift() ?? { status: 500, body: { error: 'sin respuesta' } };
    return reply.status(next.status).send(next.body);
  });
  server.get('/api/tags', async () => ({ models: [{ name: 'qwen2.5:7b' }] }));
  await server.listen({ port: 0, host: '127.0.0.1' });
  const address = server.server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await server.close();
});
beforeEach(() => {
  replies = [];
  received = [];
});

const provider = (url = baseUrl) => new OllamaProvider({ baseUrl: url, model: 'qwen2.5:7b', numCtx: 8192, timeoutMs: 5_000 });
const turn = { message: 'Hola', interpretation: 'x', assumptions: [], questions: [], enoughInfo: true };
const request = { task: 'assistant_turn' as const, system: 'sistema', messages: [{ role: 'user' as const, content: 'hola' }], schema: AssistantTurnOutput };

describe('Ollama provider', () => {
  it('sends the JSON schema and context size, and parses the answer', async () => {
    replies.push({ status: 200, body: { message: { content: JSON.stringify(turn) } } });
    const result = await provider().generate(request);
    expect(result.data).toEqual(turn);

    const body = received[0]!;
    expect(body).toMatchObject({ model: 'qwen2.5:7b', stream: false, options: { num_ctx: 8192 } });
    expect((body.format as { properties: Record<string, unknown> }).properties).toHaveProperty('questions');
    expect((body.messages as { role: string }[])[0]!.role).toBe('system');
  });

  it('retries once with the validation error when the output breaks the contract', async () => {
    replies.push({ status: 200, body: { message: { content: '{"message": 1}' } } });
    replies.push({ status: 200, body: { message: { content: JSON.stringify(turn) } } });
    const result = await provider().generate(request);
    expect(result.data.message).toBe('Hola');
    const retryMessages = received[1]!.messages as { content: string }[];
    expect(retryMessages[retryMessages.length - 1]!.content).toMatch(/no cumplía el formato/);
  });

  it('gives up after a second invalid output', async () => {
    replies.push({ status: 200, body: { message: { content: 'no es json' } } });
    replies.push({ status: 200, body: { message: { content: 'tampoco' } } });
    await expect(provider().generate(request)).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
  });

  it('explains a missing model', async () => {
    replies.push({ status: 404, body: { error: 'model "qwen2.5:7b" not found, try pulling it first' } });
    await expect(provider().generate(request)).rejects.toMatchObject({ code: 'AI_MODEL_NOT_FOUND', status: 503 });
  });

  it('explains that Ollama is not running', async () => {
    await expect(provider('http://127.0.0.1:9').generate(request)).rejects.toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
  });

  it('lists installed models, or null when unreachable', async () => {
    expect(await OllamaProvider.listModels(baseUrl)).toEqual(['qwen2.5:7b']);
    expect(await OllamaProvider.listModels('http://127.0.0.1:9')).toBeNull();
  });
});

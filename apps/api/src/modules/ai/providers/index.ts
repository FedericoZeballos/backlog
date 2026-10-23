import type { AIProviderName } from '@backlog/shared';
import { env } from '../../../env';
import { prisma } from '../../../lib/prisma';
import { AnthropicProvider } from './anthropic';
import { FakeProvider } from './fake';
import { OllamaProvider } from './ollama';
import { AIError, type LLMProvider } from './types';

export interface AISettingsValue {
  provider: AIProviderName;
  model: string;
}

const defaultModel = (provider: AIProviderName) =>
  provider === 'OLLAMA' ? env.OLLAMA_MODEL : provider === 'ANTHROPIC' ? env.ANTHROPIC_MODEL : 'modo-de-prueba';

export async function getSettings(userId: string): Promise<AISettingsValue> {
  const saved = await prisma.aISettings.findUnique({ where: { userId } });
  if (saved) return { provider: saved.provider, model: saved.model };
  return { provider: env.AI_PROVIDER, model: defaultModel(env.AI_PROVIDER) };
}

export async function saveSettings(userId: string, value: AISettingsValue): Promise<AISettingsValue> {
  const saved = await prisma.aISettings.upsert({
    where: { userId },
    create: { userId, ...value },
    update: value,
  });
  return { provider: saved.provider, model: saved.model };
}

/** Tests replace the provider with a scripted one. */
let override: LLMProvider | null = null;
export function setProviderOverride(provider: LLMProvider | null) {
  override = provider;
}

export function providerFor(settings: AISettingsValue): LLMProvider {
  if (override) return override;
  switch (settings.provider) {
    case 'OLLAMA':
      return new OllamaProvider({
        baseUrl: env.OLLAMA_BASE_URL,
        model: settings.model,
        numCtx: env.OLLAMA_NUM_CTX,
        timeoutMs: env.AI_TIMEOUT_MS,
      });
    case 'ANTHROPIC':
      if (!env.ANTHROPIC_API_KEY) {
        throw new AIError('NOT_CONFIGURED', 'Falta ANTHROPIC_API_KEY en la configuración del servidor.');
      }
      return new AnthropicProvider(env.ANTHROPIC_API_KEY, settings.model, env.AI_TIMEOUT_MS);
    case 'FAKE':
      return new FakeProvider();
  }
}

/** Whether the configured provider can answer right now, without spending tokens. */
export async function providerStatus(settings: AISettingsValue) {
  const listed = await OllamaProvider.listModels(env.OLLAMA_BASE_URL);
  const installedModels = listed ?? [];
  const base = { ...settings, installedModels, anthropicConfigured: !!env.ANTHROPIC_API_KEY };
  if (override) return { ...base, available: true, detail: 'Proveedor de prueba' };

  switch (settings.provider) {
    case 'FAKE':
      return { ...base, available: true, detail: 'Modo de prueba: respuestas fijas, sin IA real.' };
    case 'ANTHROPIC':
      return env.ANTHROPIC_API_KEY
        ? { ...base, available: true, detail: 'Clave de Anthropic configurada.' }
        : { ...base, available: false, detail: 'Falta ANTHROPIC_API_KEY en apps/api/.env.' };
    case 'OLLAMA': {
      if (listed === null) return { ...base, available: false, detail: 'Ollama no responde. Abrilo desde el menú Inicio.' };
      const installed = installedModels.some((m) => m === settings.model || m === `${settings.model}:latest`);
      return installed
        ? { ...base, available: true, detail: 'Ollama listo.' }
        : { ...base, available: false, detail: `El modelo ${settings.model} no está instalado (ollama pull ${settings.model}).` };
    }
  }
}

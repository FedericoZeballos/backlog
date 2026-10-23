/**
 * Checks that the configured AI provider answers with valid structured output, using
 * the real prompts and a sample item. Does not touch the database.
 *   npm run ai:smoke -w @backlog/api            (uses AI_PROVIDER / OLLAMA_MODEL from .env)
 *   npm run ai:smoke -w @backlog/api -- --provider OLLAMA --model qwen2.5:3b
 */
import { parseArgs } from 'node:util';
import { AssistantTurnOutput, PlanProposalOutput, type AIProviderName } from '@backlog/shared';
import { env } from '../src/env';
import { toChatMessages } from '../src/modules/ai/context';
import { ASSISTANT_TURN_SYSTEM, PLAN_SYSTEM } from '../src/modules/ai/prompts';
import { providerFor } from '../src/modules/ai/providers';

const { values } = parseArgs({ options: { provider: { type: 'string' }, model: { type: 'string' } } });
const provider = providerFor({
  provider: (values.provider as AIProviderName) ?? env.AI_PROVIDER,
  model: values.model ?? (values.provider === 'ANTHROPIC' ? env.ANTHROPIC_MODEL : env.OLLAMA_MODEL),
});

const context = `Elemento a trabajar:
<datos_del_usuario>
título: Quiero implementar facturación en mi ERP
tipo: Sin clasificar
</datos_del_usuario>

Elementos existentes de la persona (referilos solo por su ref):
<datos_del_usuario>
N1 [Objetivo] Terminar el ERP para la despensa
N2 [Proyecto] Módulo de caja y turnos
N3 [Nota] Requisitos de AFIP para factura electrónica
N4 [Objetivo] Recibirme este año
</datos_del_usuario>`;

console.log(`Proveedor: ${provider.name} · modelo: ${provider.model}\n`);

const turn = await provider.generate({
  task: 'assistant_turn',
  system: ASSISTANT_TURN_SYSTEM,
  messages: toChatMessages(context, []),
  schema: AssistantTurnOutput,
});
console.log(`— Turno (${(turn.durationMs / 1000).toFixed(1)} s)`);
console.log(JSON.stringify(turn.data, null, 2));

const history = [
  { role: 'ASSISTANT' as const, content: turn.data.message, structured: turn.data },
  { role: 'USER' as const, content: 'Solo emitir comprobantes electrónicos desde el punto de venta. La caja ya la estoy haciendo en otro proyecto.', structured: null },
];
const plan = await provider.generate({
  task: 'plan_proposal',
  system: PLAN_SYSTEM,
  messages: toChatMessages(context, history, 'Con lo que hablamos, proponé el plan.'),
  schema: PlanProposalOutput,
});
console.log(`\n— Propuesta (${(plan.durationMs / 1000).toFixed(1)} s)`);
console.log(JSON.stringify(plan.data, null, 2));

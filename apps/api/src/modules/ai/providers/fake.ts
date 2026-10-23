import type { AssistantTurnOutput, PlanProposalOutput, RecommendationOutput } from '@backlog/shared';
import type { GenerateRequest, GenerateResult, LLMProvider } from './types';

/**
 * Deterministic "model" for tests and for trying the flow without any AI installed.
 * It reads the same prompts as a real model, so the surrounding logic is exercised.
 */
export class FakeProvider implements LLMProvider {
  readonly name = 'FAKE' as const;
  readonly model = 'modo-de-prueba';

  async generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const title = /título: (.+)/.exec(req.messages[0]?.content ?? '')?.[1]?.trim() ?? 'el elemento';
    const answered = req.messages.filter((m) => m.role === 'user').length > 1;
    let data: unknown;

    if (req.task === 'assistant_turn') {
      data = answered
        ? ({
            message: 'Gracias, con eso ya puedo proponerte un plan.',
            interpretation: `Querés avanzar con "${title}".`,
            assumptions: [],
            questions: [],
            enoughInfo: true,
          } satisfies AssistantTurnOutput)
        : ({
            message: 'Antes de proponer algo, necesito aclarar el alcance.',
            interpretation: `Querés avanzar con "${title}".`,
            assumptions: ['Lo hacés vos solo'],
            questions: [{ text: '¿Qué tiene que estar listo para considerarlo terminado?', why: 'Define el alcance y las subtareas' }],
            enoughInfo: false,
          } satisfies AssistantTurnOutput);
    } else if (req.task === 'plan_proposal') {
      const firstCandidate = /\b(N\d+)\b/.exec(req.messages[0]?.content ?? '')?.[1];
      data = {
        summary: `Convertir "${title}" en un proyecto con tres pasos.`,
        update: {
          title,
          type: 'PROJECT',
          body: `Plan para ${title}.`,
          outcome: `${title} terminado y en uso`,
          doneCriteria: 'Funciona de punta a punta',
          nextAction: 'Escribir el alcance en una página',
          priority: 'MEDIUM',
          priorityReason: 'Sin fecha límite conocida',
          inferred: ['priority', 'doneCriteria'],
        },
        parentRef: '',
        children: [
          { ref: 'T1', title: 'Definir el alcance', type: 'TASK', description: '', nextAction: 'Listar lo imprescindible', dependsOn: [] },
          { ref: 'T2', title: 'Implementar', type: 'TASK', description: '', nextAction: 'Empezar por lo más simple', dependsOn: ['T1'] },
          { ref: 'T3', title: 'Probar', type: 'TASK', description: '', nextAction: 'Armar casos de prueba', dependsOn: ['T2'] },
        ],
        relations: firstCandidate
          ? [{ ref: firstCandidate, type: 'RELATED_TO', direction: 'out', reason: 'Tema relacionado' }]
          : [],
        openQuestions: ['¿Hay una fecha límite?'],
        risks: [],
      } satisfies PlanProposalOutput;
    } else {
      const ref = /\b(R\d+)\b/.exec(req.messages[0]?.content ?? '')?.[1] ?? 'R1';
      data = {
        ref,
        reason: 'Es la más urgente y no depende de nada.',
        firstStep: 'Abrila y escribí el primer paso.',
      } satisfies RecommendationOutput;
    }

    return { data: req.schema.parse(data), durationMs: 1 };
  }
}

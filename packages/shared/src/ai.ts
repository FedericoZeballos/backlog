import { z } from 'zod';
import { NODE_TYPES, PRIORITIES, type NodeType } from './enums';

export const AI_PROVIDERS = ['OLLAMA', 'ANTHROPIC', 'FAKE'] as const;
export type AIProviderName = (typeof AI_PROVIDERS)[number];

// ----------------------------------------------------------------------------
// What the model must return. Every field is required (empty string / empty list
// when unknown): small local models follow fully-required schemas much better.
// Length limits are applied after parsing, not in the schema.
// ----------------------------------------------------------------------------

export const AssistantTurnOutput = z.object({
  message: z.string().describe('Respuesta breve y amable para la persona, en español'),
  interpretation: z.string().describe('Qué entendiste que quiere lograr, en una o dos oraciones'),
  assumptions: z.array(z.string()).describe('Supuestos tuyos que la persona no confirmó'),
  questions: z
    .array(
      z.object({
        text: z.string().describe('Pregunta concreta'),
        why: z.string().describe('Qué cambia en el plan según la respuesta'),
      }),
    )
    .describe('Como máximo 3, solo si cambian el alcance, la prioridad o el plan'),
  enoughInfo: z.boolean().describe('true si ya se puede proponer un plan sin preguntar más'),
});
export type AssistantTurnOutput = z.infer<typeof AssistantTurnOutput>;

/** Types the AI may give the refined item (never back to the inbox). */
export const PLAN_NODE_TYPES = NODE_TYPES.filter((t) => t !== 'INBOX_ITEM') as Exclude<NodeType, 'INBOX_ITEM'>[];

/** Relations the AI may propose to existing items (structure goes through `parentRef`). */
export const PLAN_RELATION_TYPES = ['DEPENDS_ON', 'RELATED_TO', 'DOCUMENTS', 'DEVELOPS', 'INFORMS', 'SUPPORTS', 'DUPLICATES'] as const;

export const PLAN_FIELDS = ['title', 'type', 'body', 'outcome', 'doneCriteria', 'nextAction', 'priority'] as const;
export type PlanField = (typeof PLAN_FIELDS)[number];

export const PlanProposalOutput = z.object({
  summary: z.string().describe('Resumen de la propuesta en una o dos oraciones'),
  update: z.object({
    title: z.string().describe('Título claro y accionable'),
    type: z.enum(PLAN_NODE_TYPES as [string, ...string[]]),
    body: z.string().describe('Descripción con contexto y motivación'),
    outcome: z.string().describe('Resultado esperado; vacío si no aplica'),
    doneCriteria: z.string().describe('Criterios de finalización; vacío si no aplica'),
    nextAction: z.string().describe('Próxima acción concreta; vacío si no aplica'),
    priority: z.enum(PRIORITIES),
    priorityReason: z.string().describe('Por qué esa prioridad; vacío si es NONE'),
    inferred: z
      .array(z.enum(PLAN_FIELDS))
      .describe('Campos que deducís vos y la persona no confirmó explícitamente'),
  }),
  parentRef: z.string().describe('Ref (N…) del objetivo/proyecto existente al que pertenece, o vacío'),
  children: z
    .array(
      z.object({
        ref: z.string().describe('Identificador local: T1, T2, …'),
        title: z.string(),
        type: z.enum(['PROJECT', 'TASK']),
        description: z.string(),
        nextAction: z.string(),
        dependsOn: z.array(z.string()).describe('Refs T… que deben terminarse antes'),
      }),
    )
    .describe('Subtareas o proyectos que lo descomponen; lista vacía si no hace falta'),
  relations: z
    .array(
      z.object({
        ref: z.string().describe('Ref (N…) de un elemento existente de la lista'),
        type: z.enum(PLAN_RELATION_TYPES),
        direction: z.enum(['out', 'in']).describe('out: este elemento → el otro; in: el otro → este'),
        reason: z.string(),
      }),
    )
    .describe('Solo con elementos de la lista provista'),
  openQuestions: z.array(z.string()).describe('Preguntas que siguen sin respuesta'),
  risks: z.array(z.string()).describe('Riesgos, bloqueos o decisiones pendientes'),
});
export type PlanProposalOutput = z.infer<typeof PlanProposalOutput>;

export const RecommendationOutput = z.object({
  ref: z.string().describe('Ref (R…) de la tarea elegida'),
  reason: z.string().describe('Por qué conviene hacerla ahora, en una o dos oraciones'),
  firstStep: z.string().describe('Cómo empezar en los próximos 15 minutos'),
});
export type RecommendationOutput = z.infer<typeof RecommendationOutput>;

// ----------------------------------------------------------------------------
// Validated proposal as stored and shown to the user (refs resolved to real ids).
// ----------------------------------------------------------------------------

export interface ProposalPayload {
  summary: string;
  mode: 'plan' | 'reduce';
  /** Only fields that differ from the current node. */
  update: Partial<Record<PlanField, string>>;
  inferred: PlanField[];
  priorityReason: string;
  parent: { id: string; title: string; type: NodeType } | null;
  children: { ref: string; title: string; type: 'PROJECT' | 'TASK'; body: string; nextAction: string; dependsOn: string[] }[];
  relations: {
    nodeId: string;
    title: string;
    nodeType: NodeType;
    type: (typeof PLAN_RELATION_TYPES)[number];
    direction: 'out' | 'in';
    reason: string;
  }[];
  openQuestions: string[];
  risks: string[];
}

// ----------------------------------------------------------------------------
// API inputs
// ----------------------------------------------------------------------------

export const AISettingsInput = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string().trim().min(1).max(100),
});

export const TurnInput = z.object({ message: z.string().trim().max(5_000).optional() });

export const ProposeInput = z.object({ mode: z.enum(['plan', 'reduce']).default('plan') });

const fieldValue = z.string().trim().max(5_000);
export const ApplyProposalInput = z.object({
  /** Selected (and possibly edited) field values. */
  update: z
    .object({
      title: z.string().trim().min(1).max(300),
      type: z.enum(PLAN_NODE_TYPES as [string, ...string[]]),
      body: z.string().max(100_000),
      outcome: fieldValue,
      doneCriteria: fieldValue,
      nextAction: z.string().trim().max(1_000),
      priority: z.enum(PRIORITIES),
    })
    .partial()
    .default({}),
  parent: z.boolean().default(false),
  children: z.array(z.object({ ref: z.string().max(20), title: z.string().trim().min(1).max(300) })).max(30).default([]),
  /** Indexes into payload.relations. */
  relations: z.array(z.number().int().min(0).max(50)).max(50).default([]),
});
export type ApplyProposalInput = z.infer<typeof ApplyProposalInput>;

export const RecommendInput = z.object({
  date: z.iso.date(),
});

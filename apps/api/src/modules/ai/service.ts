import {
  AssistantTurnOutput,
  checkRelation,
  PlanProposalOutput,
  RecommendationOutput,
  structuralTypeFor,
  type AIMessageDTO,
  type AIProposalDTO,
  type ApplyProposalInput,
  type ConversationDTO,
  type NodeBrief,
  type NodeType,
  type ProposalPayload,
  type RecommendationDTO,
  type UpdateNodeInput,
} from '@backlog/shared';
import type { Prisma } from '@prisma/client';
import { AppError, notFound } from '../../lib/errors';
import { lockOwner, prisma } from '../../lib/prisma';
import { createEdge } from '../edges/service';
import { createNode, setParent, updateNode } from '../nodes/service';
import { buildNodeContext, toChatMessages } from './context';
import { ASSISTANT_TURN_SYSTEM, PLAN_SYSTEM, RECOMMEND_SYSTEM, REDUCE_EXTRA } from './prompts';
import { getSettings, providerFor } from './providers';
import { AIError } from './providers/types';
import { validatePlan } from './validate';

// ---------- One AI job per user at a time ----------

const busy = new Set<string>();

/** Double clicks or retries while a slow local model is still working must not run twice. */
async function exclusive<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  if (busy.has(userId)) throw new AppError(409, 'AI_BUSY', 'El asistente todavía está trabajando en el pedido anterior.');
  busy.add(userId);
  try {
    return await fn();
  } finally {
    busy.delete(userId);
  }
}

// ---------- Views ----------

type MessageRow = Prisma.MessageGetPayload<object>;
type ProposalRow = Prisma.AIProposalGetPayload<object>;

const toMessageDTO = (m: MessageRow): AIMessageDTO => ({
  id: m.id,
  role: m.role,
  content: m.content,
  structured: (m.structured as AIMessageDTO['structured']) ?? null,
  provider: m.provider,
  model: m.model,
  durationMs: m.durationMs,
  createdAt: m.createdAt.toISOString(),
});

const toProposalDTO = (p: ProposalRow): AIProposalDTO => ({
  id: p.id,
  status: p.status,
  payload: p.payload as unknown as ProposalPayload,
  warnings: (p.warnings as string[] | null) ?? [],
  result: (p.result as AIProposalDTO['result']) ?? null,
  provider: p.provider,
  model: p.model,
  createdAt: p.createdAt.toISOString(),
  appliedAt: p.appliedAt?.toISOString() ?? null,
});

async function conversationView(conversationId: string): Promise<ConversationDTO> {
  const c = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: 'asc' } }, proposals: { orderBy: { createdAt: 'asc' } } },
  });
  return { id: c.id, nodeId: c.nodeId, messages: c.messages.map(toMessageDTO), proposals: c.proposals.map(toProposalDTO) };
}

async function activeNode(ownerId: string, nodeId: string) {
  const node = await prisma.node.findFirst({ where: { id: nodeId, ownerId, deletedAt: null }, select: { id: true } });
  if (!node) throw notFound();
}

async function conversationFor(ownerId: string, nodeId: string) {
  return (
    (await prisma.conversation.findFirst({ where: { ownerId, nodeId }, orderBy: { createdAt: 'desc' } })) ??
    (await prisma.conversation.create({ data: { ownerId, nodeId } }))
  );
}

export async function getConversation(ownerId: string, nodeId: string): Promise<ConversationDTO | null> {
  await activeNode(ownerId, nodeId);
  const c = await prisma.conversation.findFirst({ where: { ownerId, nodeId }, orderBy: { createdAt: 'desc' } });
  return c ? conversationView(c.id) : null;
}

// ---------- Turns ----------

/**
 * Saves the user's message (if any) and asks the model for its next turn. If the model
 * fails, the user's message is kept and the turn can be retried without it.
 */
export async function runTurn(ownerId: string, nodeId: string, message?: string): Promise<ConversationDTO> {
  await activeNode(ownerId, nodeId);
  return exclusive(ownerId, async () => {
    const conversation = await conversationFor(ownerId, nodeId);
    if (message) await prisma.message.create({ data: { conversationId: conversation.id, role: 'USER', content: message } });

    const settings = await getSettings(ownerId);
    const provider = providerFor(settings);
    const ctx = await buildNodeContext(ownerId, nodeId);
    const history = await prisma.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'asc' } });

    const { data, durationMs } = await provider.generate({
      task: 'assistant_turn',
      system: ASSISTANT_TURN_SYSTEM,
      messages: toChatMessages(ctx.text, history),
      schema: AssistantTurnOutput,
    });
    const turn: AssistantTurnOutput = {
      message: data.message.trim() || 'Listo.',
      interpretation: data.interpretation.trim(),
      assumptions: data.assumptions.map((a) => a.trim()).filter(Boolean).slice(0, 6),
      questions: data.questions.filter((q) => q.text.trim()).slice(0, 3),
      enoughInfo: data.enoughInfo || data.questions.length === 0,
    };

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: turn.message,
        structured: turn as unknown as Prisma.InputJsonValue,
        provider: provider.name,
        model: provider.model,
        durationMs,
      },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    return conversationView(conversation.id);
  });
}

// ---------- Proposals ----------

export async function propose(ownerId: string, nodeId: string, mode: 'plan' | 'reduce'): Promise<ConversationDTO> {
  await activeNode(ownerId, nodeId);
  return exclusive(ownerId, async () => {
    const conversation = await conversationFor(ownerId, nodeId);
    const settings = await getSettings(ownerId);
    const provider = providerFor(settings);
    const ctx = await buildNodeContext(ownerId, nodeId);
    const history = await prisma.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'asc' } });

    const { data } = await provider.generate({
      task: 'plan_proposal',
      system: mode === 'reduce' ? PLAN_SYSTEM + REDUCE_EXTRA : PLAN_SYSTEM,
      messages: toChatMessages(
        ctx.text,
        history,
        mode === 'reduce'
          ? 'Ayudame a partir esto en pasos chicos hasta tener algo que pueda hacer hoy.'
          : 'Con lo que hablamos, proponé el plan.',
      ),
      schema: PlanProposalOutput,
    });

    const currentParent = ctx.ancestors[0]?.id ?? null;
    const { payload, warnings } = validatePlan(data, ctx.node, ctx.candidates, currentParent, mode);
    await prisma.aIProposal.create({
      data: {
        ownerId,
        conversationId: conversation.id,
        nodeId,
        nodeVersion: ctx.node.version,
        payload: payload as unknown as Prisma.InputJsonValue,
        warnings,
        provider: provider.name,
        model: provider.model,
      },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    return conversationView(conversation.id);
  });
}

export async function rejectProposal(ownerId: string, proposalId: string) {
  const { count } = await prisma.aIProposal.updateMany({
    where: { id: proposalId, ownerId, status: 'PENDING' },
    data: { status: 'REJECTED' },
  });
  if (!count) throw notFound('Propuesta pendiente');
  const p = await prisma.aIProposal.findUniqueOrThrow({ where: { id: proposalId } });
  return conversationView(p.conversationId);
}

const canContain = (parent: NodeType, child: NodeType) => checkRelation(structuralTypeFor(parent, child), parent, child).ok;
const orNull = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);

/**
 * Applies what the user selected, all or nothing. Applying twice returns the first
 * result. Relations that became invalid meanwhile are skipped and reported.
 */
export async function applyProposal(ownerId: string, proposalId: string, input: ApplyProposalInput) {
  const conversationId = await prisma.$transaction(
    async (tx) => {
      await lockOwner(tx, ownerId);
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id::text FROM "AIProposal" WHERE id = ${proposalId}::uuid AND "ownerId" = ${ownerId}::uuid FOR UPDATE`;
      if (!locked.length) throw notFound('Propuesta');
      const proposal = await tx.aIProposal.findUniqueOrThrow({ where: { id: proposalId } });
      if (proposal.status === 'ACCEPTED' || proposal.status === 'PARTIAL') return proposal.conversationId;
      if (proposal.status === 'REJECTED') throw new AppError(409, 'PROPOSAL_REJECTED', 'La propuesta ya fue descartada.');

      const payload = proposal.payload as unknown as ProposalPayload;
      const node = await tx.node.findFirst({ where: { id: proposal.nodeId ?? '', ownerId, deletedAt: null } });
      if (!node) throw new AppError(409, 'NODE_GONE', 'El elemento ya no existe o está en la papelera.');

      const skipped: string[] = [];
      const created: NodeBrief[] = [];
      let relationCount = 0;

      // 1. Field updates: only fields that were proposed, possibly edited by the user.
      const fields = Object.keys(input.update).filter((f) => f in payload.update) as (keyof ApplyProposalInput['update'])[];
      let finalType = node.type as NodeType;
      if (fields.length) {
        const patch: UpdateNodeInput = { version: node.version };
        const u = input.update;
        if (fields.includes('title')) patch.title = u.title;
        if (fields.includes('type')) patch.type = u.type as NodeType;
        if (fields.includes('body')) patch.body = u.body;
        if (fields.includes('outcome')) patch.outcome = orNull(u.outcome);
        if (fields.includes('doneCriteria')) patch.doneCriteria = orNull(u.doneCriteria);
        if (fields.includes('nextAction')) patch.nextAction = orNull(u.nextAction);
        if (fields.includes('priority')) {
          patch.priority = u.priority === 'NONE' ? null : u.priority;
          // Accepting keeps the origin visible: the AI suggested it, the user did not set it.
          patch.prioritySource = u.priority === 'NONE' ? null : 'AI_SUGGESTED';
        }
        const updated = await updateNode(ownerId, node.id, patch, 'AI', tx);
        finalType = updated.type;
      }

      // 2. Parent.
      if (input.parent && payload.parent) {
        if (canContain(payload.parent.type, finalType)) {
          try {
            await setParent(ownerId, node.id, payload.parent.id, 'AI', tx);
          } catch (err) {
            if (!(err instanceof AppError)) throw err;
            skipped.push(`No se pudo ubicar en "${payload.parent.title}": ${err.message}`);
          }
        } else skipped.push(`"${payload.parent.title}" no puede contener un elemento de este tipo.`);
      }

      // 3. Children: contained when the type allows it, otherwise linked as developing it.
      const chosen = payload.children.filter((c) => input.children.some((s) => s.ref === c.ref));
      const idByRef = new Map<string, string>();
      for (const child of chosen) {
        const title = input.children.find((s) => s.ref === child.ref)!.title;
        const contained = canContain(finalType, child.type);
        const createdNode = await createNode(
          ownerId,
          {
            type: child.type,
            title,
            body: child.body || undefined,
            nextAction: child.nextAction || undefined,
            parentId: contained ? node.id : undefined,
          },
          'AI',
          tx,
        );
        idByRef.set(child.ref, createdNode.id);
        created.push({ id: createdNode.id, title: createdNode.title, type: createdNode.type });
        if (!contained) {
          const linkType = checkRelation('DEVELOPS', child.type, finalType).ok ? 'DEVELOPS' : 'RELATED_TO';
          await createEdge(ownerId, { sourceId: createdNode.id, targetId: node.id, type: linkType }, 'AI', tx);
        }
      }
      for (const child of chosen) {
        for (const dep of child.dependsOn) {
          const sourceId = idByRef.get(child.ref);
          const targetId = idByRef.get(dep);
          if (!sourceId || !targetId) continue;
          try {
            await createEdge(ownerId, { sourceId, targetId, type: 'DEPENDS_ON' }, 'AI', tx);
          } catch (err) {
            if (!(err instanceof AppError)) throw err;
            skipped.push(`Dependencia omitida en "${child.title}": ${err.message}`);
          }
        }
      }

      // 4. Relations to existing items (re-validated now; the graph may have changed).
      for (const index of [...new Set(input.relations)]) {
        const rel = payload.relations[index];
        if (!rel) continue;
        const [sourceId, targetId] = rel.direction === 'out' ? [node.id, rel.nodeId] : [rel.nodeId, node.id];
        try {
          await createEdge(ownerId, { sourceId, targetId, type: rel.type }, 'AI', tx);
          relationCount++;
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
          skipped.push(`Relación con "${rel.title}" omitida: ${err.message}`);
        }
      }

      const everything =
        fields.length === Object.keys(payload.update).length &&
        input.parent === !!payload.parent &&
        chosen.length === payload.children.length &&
        new Set(input.relations).size === payload.relations.length &&
        skipped.length === 0;

      await tx.aIProposal.update({
        where: { id: proposalId },
        data: {
          status: everything ? 'ACCEPTED' : 'PARTIAL',
          appliedAt: new Date(),
          result: { created, relations: relationCount, updatedFields: fields, skipped } as unknown as Prisma.InputJsonValue,
        },
      });
      return proposal.conversationId;
    },
    { timeout: 30_000 },
  );
  return conversationView(conversationId);
}

// ---------- Recommendation ----------

const PRIORITY_ORDER = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

/** Picks what to do next. Works without AI: falls back to priority and due date. */
export async function recommend(ownerId: string, date: string): Promise<RecommendationDTO | null> {
  const tasks = await prisma.node.findMany({
    where: {
      ownerId,
      type: 'TASK',
      deletedAt: null,
      archivedAt: null,
      processed: true,
      OR: [{ statusId: null }, { status: { category: { notIn: ['DONE', 'BLOCKED'] } } }],
      outgoing: { none: { type: 'DEPENDS_ON', target: { deletedAt: null, status: { category: { not: 'DONE' } } } } },
    },
    select: {
      id: true,
      title: true,
      type: true,
      priority: true,
      prioritySource: true,
      dueDate: true,
      nextAction: true,
      createdAt: true,
      incoming: {
        where: { type: { in: ['CONTAINS', 'PARENT_OF'] }, source: { deletedAt: null } },
        select: { source: { select: { title: true, type: true } } },
        take: 1,
      },
    },
  });
  if (!tasks.length) return null;

  const ranked = tasks
    .sort((a, b) => {
      const da = a.dueDate?.getTime() ?? Infinity;
      const db = b.dueDate?.getTime() ?? Infinity;
      const overdueA = da <= new Date(`${date}T00:00:00Z`).getTime();
      const overdueB = db <= new Date(`${date}T00:00:00Z`).getTime();
      if (overdueA !== overdueB) return overdueA ? -1 : 1;
      const pa = PRIORITY_ORDER.indexOf(a.priority ?? 'NONE');
      const pb = PRIORITY_ORDER.indexOf(b.priority ?? 'NONE');
      if (pa !== pb) return pa - pb;
      if (da !== db) return da - db;
      return a.createdAt.getTime() - b.createdAt.getTime();
    })
    .slice(0, 8);

  const fallback = ranked[0]!;
  const brief = (t: (typeof ranked)[number]): NodeBrief => ({ id: t.id, title: t.title, type: t.type });
  const deterministic: RecommendationDTO = {
    node: brief(fallback),
    reason: fallback.dueDate ? 'Es la más urgente por fecha y prioridad.' : 'Es la primera por prioridad entre las que no tienen bloqueos.',
    firstStep: fallback.nextAction ?? 'Abrila y anotá cuál es el primer paso concreto.',
    byAI: false,
  };

  const list = ranked
    .map((t, i) => {
      const parts = [`R${i + 1} ${t.title}`];
      if (t.priority && t.priority !== 'NONE') parts.push(`prioridad ${t.priority}${t.prioritySource === 'AI_SUGGESTED' ? ' (sugerida, sin confirmar)' : ''}`);
      if (t.dueDate) parts.push(`vence ${t.dueDate.toISOString().slice(0, 10)}`);
      if (t.incoming[0]) parts.push(`dentro de "${t.incoming[0].source.title}"`);
      if (t.nextAction) parts.push(`próxima acción: ${t.nextAction}`);
      return parts.join(' · ').replace(/<\/?datos_del_usuario>/gi, '');
    })
    .join('\n');

  try {
    const provider = providerFor(await getSettings(ownerId));
    const { data } = await exclusive(ownerId, () =>
      provider.generate({
        task: 'recommendation',
        system: RECOMMEND_SYSTEM,
        messages: [{ role: 'user', content: `Hoy es ${date}. Tareas posibles:\n<datos_del_usuario>\n${list}\n</datos_del_usuario>` }],
        schema: RecommendationOutput,
      }),
    );
    const index = Number(/R(\d+)/i.exec(data.ref)?.[1]) - 1;
    const chosen = ranked[index];
    if (!chosen) return deterministic;
    return { node: brief(chosen), reason: data.reason.trim(), firstStep: data.firstStep.trim(), byAI: true };
  } catch (err) {
    if (err instanceof AIError || (err instanceof AppError && err.code === 'AI_BUSY')) return deterministic;
    throw err;
  }
}

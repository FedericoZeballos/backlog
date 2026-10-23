import { RELATION_RULES, type NodeType } from '@backlog/shared';
import { prisma } from '../../lib/prisma';
import { activeEdgeWhere, STRUCTURAL_TYPES } from '../edges/rules';
import { relatedNodeIds, similarNodes } from '../nodes/search';
import { getNode } from '../nodes/service';
import type { ChatMessage } from './providers/types';

const TYPE_ES: Record<NodeType, string> = {
  AREA: 'Área',
  GOAL: 'Objetivo',
  PROJECT: 'Proyecto',
  TASK: 'Tarea',
  IDEA: 'Idea',
  PROBLEM: 'Problema',
  NOTE: 'Nota',
  DECISION: 'Decisión',
  RESOURCE: 'Recurso',
  INBOX_ITEM: 'Sin clasificar',
};

export interface Candidate {
  ref: string;
  id: string;
  title: string;
  type: NodeType;
}

/** Keeps user text from closing our delimiters. */
const clean = (s: string) => s.replace(/<\/?datos_del_usuario>/gi, '');

const MAX_CANDIDATES = 35;

/**
 * Everything the model needs about one node, rebuilt on every call so it always sees
 * the current data. Existing items are listed with short refs (N1, N2…): the model can
 * only point at those, and the backend maps refs back to ids.
 */
export async function buildNodeContext(ownerId: string, nodeId: string) {
  const { node, relations } = await getNode(ownerId, nodeId);

  // Structural ancestors: "Proyecto A › Objetivo B".
  const ancestors: { id: string; title: string; type: NodeType }[] = [];
  let current = nodeId;
  for (let i = 0; i < 5; i++) {
    const parent = await prisma.edge.findFirst({
      where: { ownerId, targetId: current, type: { in: STRUCTURAL_TYPES }, ...activeEdgeWhere },
      include: { source: { select: { id: true, title: true, type: true } } },
    });
    if (!parent) break;
    ancestors.push(parent.source);
    current = parent.source.id;
  }

  const excluded = new Set([nodeId, ...relations.map((r) => r.node.id)]);
  const searchText = node.title.slice(0, 200);
  const [containers, searched, similar] = await Promise.all([
    prisma.node.findMany({
      where: { ownerId, deletedAt: null, archivedAt: null, type: { in: ['AREA', 'GOAL', 'PROJECT'] } },
      select: { id: true, title: true, type: true },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    }),
    relatedNodeIds(ownerId, `${node.title} ${node.body.slice(0, 300)}`, 12).catch(() => [] as string[]),
    similarNodes(ownerId, searchText, nodeId).catch(() => []),
  ]);
  const searchedNodes = searched.length
    ? await prisma.node.findMany({
        where: { id: { in: searched.slice(0, 10) }, deletedAt: null, archivedAt: null, type: { not: 'INBOX_ITEM' } },
        select: { id: true, title: true, type: true },
      })
    : [];

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const c of [...similar, ...searchedNodes, ...containers]) {
    // Ancestors stay listed: the model may confirm the current parent.
    if (seen.has(c.id) || (excluded.has(c.id) && !ancestors.some((a) => a.id === c.id))) continue;
    if (candidates.length >= MAX_CANDIDATES) break;
    seen.add(c.id);
    candidates.push({ ref: `N${candidates.length + 1}`, id: c.id, title: c.title, type: c.type as NodeType });
  }

  const line = (label: string, value: string | null | undefined) => (value ? `${label}: ${clean(value)}\n` : '');
  const relationText = relations
    .filter((r) => r.category !== 'STRUCTURAL')
    .map((r) => `${r.direction === 'out' ? RELATION_RULES[r.type].label : RELATION_RULES[r.type].inverseLabel} "${clean(r.node.title)}"`)
    .join('; ');

  const text =
    `Elemento a trabajar:\n<datos_del_usuario>\n` +
    line('título', node.title) +
    line('tipo', TYPE_ES[node.type]) +
    line('estado', node.status?.name) +
    line('descripción', node.body) +
    line('resultado esperado', node.outcome) +
    line('criterio de terminado', node.doneCriteria) +
    line('próxima acción', node.nextAction) +
    line('prioridad', node.priority && node.priority !== 'NONE' ? node.priority : null) +
    line('fecha límite', node.dueDate) +
    line('pertenece a', ancestors.map((a) => `${TYPE_ES[a.type]} "${a.title}"`).join(' › ')) +
    line('relaciones actuales', relationText) +
    `</datos_del_usuario>\n\n` +
    (candidates.length
      ? `Elementos existentes de la persona (referilos solo por su ref):\n<datos_del_usuario>\n${candidates
          .map((c) => `${c.ref} [${TYPE_ES[c.type]}] ${clean(c.title)}`)
          .join('\n')}\n</datos_del_usuario>`
      : 'La persona todavía no tiene otros objetivos ni proyectos cargados.');

  return { node, relations, ancestors, candidates, text };
}

interface StoredMessage {
  role: 'USER' | 'ASSISTANT';
  content: string;
  structured: unknown;
}

/** Turns the stored dialogue into model messages, prefixed by the fresh context. */
export function toChatMessages(contextText: string, history: StoredMessage[], finalInstruction?: string): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'user', content: `${contextText}\n\nAyudame a refinar este elemento.` }];
  for (const m of history.slice(-20)) {
    if (m.role === 'USER') {
      messages.push({ role: 'user', content: m.content });
    } else {
      const s = m.structured as { interpretation?: string; questions?: { text: string }[] } | null;
      const questions = s?.questions?.length ? `\nPreguntas: ${s.questions.map((q) => q.text).join(' / ')}` : '';
      messages.push({ role: 'assistant', content: `${m.content}${s?.interpretation ? `\nInterpretación: ${s.interpretation}` : ''}${questions}` });
    }
  }
  if (finalInstruction) messages.push({ role: 'user', content: finalInstruction });
  return messages;
}

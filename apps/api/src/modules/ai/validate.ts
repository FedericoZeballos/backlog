import {
  checkRelation,
  PLAN_FIELDS,
  PLAN_NODE_TYPES,
  structuralTypeFor,
  type NodeType,
  type PlanField,
  type PlanProposalOutput,
  type ProposalPayload,
} from '@backlog/shared';
import type { NodeDTO } from '../nodes/service';
import type { Candidate } from './context';

const MAX_CHILDREN = 10;
const MAX_RELATIONS = 8;
const MAX_LIST = 6;

const canContain = (parent: NodeType, child: NodeType) => checkRelation(structuralTypeFor(parent, child), parent, child).ok;

const currentValue = (node: NodeDTO, field: PlanField): string => {
  if (field === 'body') return node.body;
  if (field === 'priority') return node.priority ?? 'NONE';
  return (node[field] as string | null) ?? '';
};

const INFORMING_TYPES: NodeType[] = ['NOTE', 'RESOURCE', 'DECISION'];

/** Small models write refs like "N2 [Proyecto] Caja": keep only the ref itself. */
export const refOf = (s: string) => /\b([NT]\d+)\b/i.exec(s)?.[1]?.toUpperCase() ?? '';

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const tidy = (list: string[]) => list.map((s) => s.trim()).filter(Boolean).slice(0, MAX_LIST);

/**
 * Turns raw model output into a proposal that only references real items and only
 * contains relations the domain allows. Anything dropped is reported as a warning.
 */
export function validatePlan(
  raw: PlanProposalOutput,
  node: NodeDTO,
  candidates: Candidate[],
  currentParentId: string | null,
  mode: 'plan' | 'reduce',
): { payload: ProposalPayload; warnings: string[] } {
  const warnings: string[] = [];
  const byRef = new Map(candidates.map((c) => [c.ref.toUpperCase(), c]));

  // Field updates: only real changes.
  const update: ProposalPayload['update'] = {};
  for (const field of PLAN_FIELDS) {
    const value = String(raw.update[field] ?? '').trim();
    if (!value || value === currentValue(node, field)) continue;
    if (field === 'priority' && value === 'NONE') continue;
    if (field === 'type' && !(PLAN_NODE_TYPES as string[]).includes(value)) continue;
    update[field] = value;
  }
  const finalType = (update.type ?? node.type) as NodeType;
  const inferred = raw.update.inferred.filter((f) => f in update);

  // Parent: an existing container that can hold the (possibly retyped) node.
  let parent: ProposalPayload['parent'] = null;
  const parentRef = refOf(raw.parentRef);
  if (parentRef) {
    const c = byRef.get(parentRef);
    if (!c) warnings.push('Se descartó un contenedor que no existe en tus elementos.');
    else if (c.id === currentParentId) {
      // Already there.
    } else if (!canContain(c.type, finalType)) {
      warnings.push(`"${c.title}" no puede contener un elemento de este tipo.`);
    } else parent = { id: c.id, title: c.title, type: c.type };
  }

  // Children with unique refs; dependencies only among them and without cycles.
  const children: ProposalPayload['children'] = [];
  const refs = new Set<string>();
  for (const child of raw.children) {
    const ref = refOf(child.ref) || `T${children.length + 1}`;
    const title = child.title.trim();
    if (!title || refs.has(ref)) continue;

    // Models sometimes copy an existing item as a "new" step: never duplicate it.
    const existing = byRef.get(ref) ?? candidates.find((c) => normalize(c.title) === normalize(title));
    if (existing) {
      if (!parent && existing.id !== currentParentId && canContain(existing.type, finalType)) {
        parent = { id: existing.id, title: existing.title, type: existing.type };
        warnings.push(`"${existing.title}" ya existe: se propone como contenedor en lugar de crearlo de nuevo.`);
      } else {
        warnings.push(`"${existing.title}" ya existe: no se vuelve a crear.`);
      }
      continue;
    }
    if (children.length >= MAX_CHILDREN) {
      warnings.push(`Se propusieron más de ${MAX_CHILDREN} pasos; se muestran los primeros.`);
      break;
    }
    refs.add(ref);
    children.push({
      ref,
      title: title.slice(0, 300),
      type: child.type === 'PROJECT' ? 'PROJECT' : 'TASK',
      body: child.description.trim(),
      nextAction: child.nextAction.trim().slice(0, 1_000),
      dependsOn: child.dependsOn.map(refOf).filter(Boolean),
    });
  }
  for (const child of children) {
    const valid = [...new Set(child.dependsOn)].filter((d) => d !== child.ref && refs.has(d));
    child.dependsOn = [];
    for (const dep of valid) {
      // Adding child → dep must not let dep reach child.
      if (reaches(children, dep, child.ref)) warnings.push(`Se quitó una dependencia circular entre "${child.title}" y otro paso.`);
      else child.dependsOn.push(dep);
    }
  }

  // Relations to existing items, checked against the relation rules.
  const relations: ProposalPayload['relations'] = [];
  for (const rel of raw.relations) {
    const c = byRef.get(refOf(rel.ref));
    if (!c) {
      warnings.push('Se descartó una relación con un elemento que no existe.');
      continue;
    }
    if (c.id === node.id || c.id === parent?.id) continue;
    let { type, direction } = rel;
    const ok = direction === 'out' ? checkRelation(type, finalType, c.type).ok : checkRelation(type, c.type, finalType).ok;
    if (!ok) {
      // "Depends on a note" means the note informs this item: repair instead of dropping it.
      if (type === 'DEPENDS_ON' && INFORMING_TYPES.includes(c.type) && checkRelation('INFORMS', c.type, finalType).ok) {
        type = 'INFORMS';
        direction = 'in';
        warnings.push(`Se ajustó la relación con "${c.title}": aporta información (una nota o recurso no puede ser una dependencia).`);
      } else {
        warnings.push(`Se descartó la relación "${rel.type}" con "${c.title}": no es válida para esos tipos.`);
        continue;
      }
    }
    if (relations.some((r) => r.nodeId === c.id && r.type === type)) continue;
    if (relations.length >= MAX_RELATIONS) break;
    relations.push({ nodeId: c.id, title: c.title, nodeType: c.type, type, direction, reason: rel.reason.trim() });
  }

  return {
    payload: {
      summary: raw.summary.trim(),
      mode,
      update,
      inferred,
      priorityReason: update.priority ? raw.update.priorityReason.trim() : '',
      parent,
      children,
      relations,
      openQuestions: tidy(raw.openQuestions),
      risks: tidy(raw.risks),
    },
    warnings,
  };
}

/** Whether `from` reaches `to` following dependsOn among the proposed children. */
function reaches(children: ProposalPayload['children'], from: string, to: string): boolean {
  const byRef = new Map(children.map((c) => [c.ref, c]));
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length) {
    const ref = stack.pop()!;
    if (ref === to) return true;
    if (seen.has(ref)) continue;
    seen.add(ref);
    stack.push(...(byRef.get(ref)?.dependsOn ?? []));
  }
  return false;
}

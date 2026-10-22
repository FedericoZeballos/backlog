import { NODE_TYPES, type EdgeType, type NodeType } from './enums';

/**
 * STRUCTURAL: hierarchy (a node has at most one structural parent; no cycles).
 * EXECUTION: ordering between actionable work (no cycles).
 * CONCEPTUAL: meaning only; no effect on execution, cycles allowed.
 */
export type EdgeCategory = 'STRUCTURAL' | 'EXECUTION' | 'CONCEPTUAL';

export interface RelationRule {
  category: EdgeCategory;
  /** A–B and B–A mean the same thing, so only one of them may exist. */
  symmetric: boolean;
  /** Allowed target types for each allowed source type. */
  allowed: Partial<Record<NodeType, readonly NodeType[]>>;
  /** Labels read as "<source> <label> <target>" and "<target> <inverseLabel> <source>". */
  label: string;
  inverseLabel: string;
}

const ANY = NODE_TYPES;

function fromAll(targets: readonly NodeType[]): Partial<Record<NodeType, readonly NodeType[]>> {
  return Object.fromEntries(NODE_TYPES.map((t) => [t, targets]));
}

export const RELATION_RULES: Record<EdgeType, RelationRule> = {
  CONTAINS: {
    category: 'STRUCTURAL',
    symmetric: false,
    allowed: {
      AREA: ['GOAL', 'PROJECT', 'TASK'],
      GOAL: ['GOAL', 'PROJECT', 'TASK'],
      PROJECT: ['PROJECT', 'TASK'],
    },
    label: 'contiene',
    inverseLabel: 'pertenece a',
  },
  PARENT_OF: {
    category: 'STRUCTURAL',
    symmetric: false,
    allowed: { TASK: ['TASK'] },
    label: 'tiene como subtarea',
    inverseLabel: 'es subtarea de',
  },
  DEPENDS_ON: {
    category: 'EXECUTION',
    symmetric: false,
    allowed: { PROJECT: ['PROJECT', 'TASK'], TASK: ['PROJECT', 'TASK'] },
    label: 'depende de',
    inverseLabel: 'bloquea a',
  },
  RELATED_TO: {
    category: 'CONCEPTUAL',
    symmetric: true,
    allowed: fromAll(ANY),
    label: 'se relaciona con',
    inverseLabel: 'se relaciona con',
  },
  DOCUMENTS: {
    category: 'CONCEPTUAL',
    symmetric: false,
    allowed: { NOTE: ANY, RESOURCE: ANY },
    label: 'documenta',
    inverseLabel: 'está documentado por',
  },
  DEVELOPS: {
    category: 'CONCEPTUAL',
    symmetric: false,
    allowed: {
      GOAL: ['IDEA', 'PROBLEM'],
      PROJECT: ['IDEA', 'PROBLEM'],
      TASK: ['IDEA', 'PROBLEM'],
      NOTE: ['IDEA', 'PROBLEM'],
      DECISION: ['IDEA', 'PROBLEM'],
    },
    label: 'desarrolla',
    inverseLabel: 'es desarrollada por',
  },
  INFORMS: {
    category: 'CONCEPTUAL',
    symmetric: false,
    allowed: { RESOURCE: ANY, NOTE: ANY, DECISION: ANY },
    label: 'aporta información a',
    inverseLabel: 'se informa con',
  },
  SUPPORTS: {
    category: 'CONCEPTUAL',
    symmetric: false,
    allowed: {
      PROJECT: ['GOAL', 'AREA'],
      TASK: ['GOAL', 'AREA'],
      GOAL: ['GOAL', 'AREA'],
      IDEA: ['GOAL', 'AREA'],
    },
    label: 'contribuye a',
    inverseLabel: 'recibe aporte de',
  },
  DERIVED_FROM: {
    category: 'CONCEPTUAL',
    symmetric: false,
    allowed: fromAll(ANY),
    label: 'surge de',
    inverseLabel: 'dio origen a',
  },
  DUPLICATES: {
    category: 'CONCEPTUAL',
    symmetric: true,
    allowed: fromAll(ANY),
    label: 'duplica a',
    inverseLabel: 'duplica a',
  },
};

export function edgeCategory(type: EdgeType): EdgeCategory {
  return RELATION_RULES[type].category;
}

export function edgeTypesInCategory(category: EdgeCategory): EdgeType[] {
  return (Object.keys(RELATION_RULES) as EdgeType[]).filter(
    (t) => RELATION_RULES[t].category === category,
  );
}

/** The structural relation used to put `child` under `parent`: subtasks for task→task, containment otherwise. */
export function structuralTypeFor(parentType: NodeType, childType: NodeType): EdgeType {
  return parentType === 'TASK' && childType === 'TASK' ? 'PARENT_OF' : 'CONTAINS';
}

export type RelationCheck = { ok: true } | { ok: false; reason: string };

export function checkRelation(type: EdgeType, sourceType: NodeType, targetType: NodeType): RelationCheck {
  const rule = RELATION_RULES[type];
  const targets = rule.allowed[sourceType];
  if (targets?.includes(targetType)) return { ok: true };
  return {
    ok: false,
    reason: `Un nodo ${sourceType} no puede tener una relación ${type} hacia un nodo ${targetType}`,
  };
}

/** Target types allowed for `type` from a given source (useful for the UI's relation picker). */
export function allowedTargets(type: EdgeType, sourceType: NodeType): readonly NodeType[] {
  return RELATION_RULES[type].allowed[sourceType] ?? [];
}

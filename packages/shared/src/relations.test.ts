import { describe, expect, it } from 'vitest';
import { EDGE_TYPES } from './enums';
import { RELATION_RULES, checkRelation, edgeCategory, edgeTypesInCategory } from './relations';

describe('relation rules', () => {
  it('defines a rule for every edge type', () => {
    for (const t of EDGE_TYPES) expect(RELATION_RULES[t]).toBeDefined();
  });

  it('keeps execution dependencies separate from conceptual relations', () => {
    expect(edgeCategory('DEPENDS_ON')).toBe('EXECUTION');
    expect(edgeCategory('RELATED_TO')).toBe('CONCEPTUAL');
    expect(edgeTypesInCategory('EXECUTION')).toEqual(['DEPENDS_ON']);
    expect(edgeTypesInCategory('STRUCTURAL').sort()).toEqual(['CONTAINS', 'PARENT_OF']);
  });

  it('accepts the examples from the spec', () => {
    expect(checkRelation('CONTAINS', 'GOAL', 'PROJECT').ok).toBe(true);
    expect(checkRelation('CONTAINS', 'PROJECT', 'TASK').ok).toBe(true);
    expect(checkRelation('DEPENDS_ON', 'TASK', 'TASK').ok).toBe(true);
    expect(checkRelation('DOCUMENTS', 'NOTE', 'DECISION').ok).toBe(true);
    expect(checkRelation('RELATED_TO', 'IDEA', 'PROJECT').ok).toBe(true);
    expect(checkRelation('SUPPORTS', 'PROJECT', 'GOAL').ok).toBe(true);
    expect(checkRelation('DEVELOPS', 'TASK', 'IDEA').ok).toBe(true);
    expect(checkRelation('INFORMS', 'RESOURCE', 'TASK').ok).toBe(true);
  });

  it('rejects nonsensical combinations', () => {
    expect(checkRelation('CONTAINS', 'TASK', 'PROJECT').ok).toBe(false);
    expect(checkRelation('DEPENDS_ON', 'IDEA', 'TASK').ok).toBe(false);
    expect(checkRelation('PARENT_OF', 'PROJECT', 'TASK').ok).toBe(false);
    expect(checkRelation('DOCUMENTS', 'TASK', 'NOTE').ok).toBe(false);
  });
});

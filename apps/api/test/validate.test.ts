import type { PlanProposalOutput } from '@backlog/shared';
import { describe, expect, it } from 'vitest';
import type { Candidate } from '../src/modules/ai/context';
import { validatePlan } from '../src/modules/ai/validate';
import type { NodeDTO } from '../src/modules/nodes/service';

const node = {
  id: 'n0',
  type: 'INBOX_ITEM',
  title: 'Quiero implementar facturación en mi ERP',
  body: '',
  priority: null,
  outcome: null,
  doneCriteria: null,
  nextAction: null,
} as unknown as NodeDTO;

const candidates: Candidate[] = [
  { ref: 'N1', id: 'goal', title: 'Terminar el ERP para la despensa', type: 'GOAL' },
  { ref: 'N2', id: 'project', title: 'Módulo de caja y turnos', type: 'PROJECT' },
  { ref: 'N3', id: 'note', title: 'Requisitos de AFIP para factura electrónica', type: 'NOTE' },
];

// Shape returned by qwen2.5:7b in a real run (trimmed).
const realOutput: PlanProposalOutput = {
  summary: 'Implementar facturación electrónica en el punto de venta',
  update: {
    title: 'Implementar facturación electrónica en el punto de venta',
    type: 'PROJECT',
    body: 'Emitir comprobantes electrónicos desde el punto de venta.',
    outcome: 'El ERP emite comprobantes electrónicos',
    doneCriteria: '',
    nextAction: 'Revisar requisitos de AFIP',
    priority: 'NONE',
    priorityReason: 'No hay prisa',
    inferred: ['type', 'body', 'outcome', 'doneCriteria'],
  },
  parentRef: '',
  children: [
    { ref: 'N1', title: 'Terminar el ERP para la despensa', type: 'PROJECT', description: '', nextAction: '', dependsOn: [] },
    { ref: 'T1', title: 'Pedir el certificado digital', type: 'TASK', description: '', nextAction: 'Entrar a AFIP', dependsOn: [] },
  ],
  relations: [{ ref: 'N3', type: 'DEPENDS_ON', direction: 'out', reason: 'Requisitos necesarios' }],
  openQuestions: [],
  risks: ['Cambios en los requisitos de AFIP'],
};

describe('validatePlan', () => {
  const { payload, warnings } = validatePlan(realOutput, node, candidates, null, 'plan');

  it('turns an existing item copied as a child into the parent instead of duplicating it', () => {
    expect(payload.children.map((c) => c.title)).toEqual(['Pedir el certificado digital']);
    expect(payload.parent).toEqual({ id: 'goal', title: 'Terminar el ERP para la despensa', type: 'GOAL' });
    expect(warnings.join(' ')).toMatch(/ya existe/);
  });

  it('repairs "depends on a note" into "the note informs this"', () => {
    expect(payload.relations).toEqual([expect.objectContaining({ nodeId: 'note', type: 'INFORMS', direction: 'in' })]);
    expect(warnings.join(' ')).toMatch(/aporta información/);
  });

  it('keeps only real field changes and no priority without a basis', () => {
    expect(payload.update).not.toHaveProperty('priority');
    expect(payload.update).not.toHaveProperty('doneCriteria');
    expect(payload.priorityReason).toBe('');
    expect(payload.inferred).toEqual(['type', 'body', 'outcome']);
  });

  it('accepts refs written with extra text, as small models do', () => {
    const sloppy = validatePlan(
      {
        ...realOutput,
        parentRef: 'N2 [Proyecto] Módulo de caja y turnos',
        children: [
          { ref: 'T1 [Analizar]', title: 'Analizar requisitos', type: 'TASK', description: '', nextAction: '', dependsOn: [] },
          { ref: 'T2', title: 'Desarrollar', type: 'TASK', description: '', nextAction: '', dependsOn: ['T1 [Analizar requisitos]', 'N2 [Proyecto]'] },
        ],
        relations: [],
      },
      node,
      candidates,
      null,
      'plan',
    );
    expect(sloppy.payload.parent?.id).toBe('project');
    expect(sloppy.payload.children.map((c) => `${c.ref}:${c.dependsOn.join(',')}`)).toEqual(['T1:', 'T2:T1']);
  });

  it('does not propose the current parent again', () => {
    const again = validatePlan({ ...realOutput, parentRef: 'N1', children: [] }, node, candidates, 'goal', 'plan');
    expect(again.payload.parent).toBeNull();
  });
});

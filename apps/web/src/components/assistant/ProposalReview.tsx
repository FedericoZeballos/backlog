import { RELATION_RULES, type AIProposalDTO, type NodeType, type PlanField, type Priority } from '@backlog/shared';
import { CheckCircle2, ListChecks, XCircle } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { useApplyProposal, useRejectProposal } from '../../api/hooks';
import { PRIORITY_LABEL, TYPE_LABEL } from '../../lib/labels';
import { useSelectedNode } from '../../lib/selection';
import { TypeBadge } from '../badges';
import { useToast } from '../feedback';

const FIELD_LABEL: Record<PlanField, string> = {
  title: 'Título',
  type: 'Tipo',
  body: 'Descripción',
  outcome: 'Resultado esperado',
  doneCriteria: 'Criterio de terminado',
  nextAction: 'Próxima acción',
  priority: 'Prioridad',
};

const MULTILINE: PlanField[] = ['body', 'outcome', 'doneCriteria'];

export function ProposalReview({ nodeId, proposal }: { nodeId: string; proposal: AIProposalDTO }) {
  const p = proposal.payload;
  const fields = Object.keys(p.update) as PlanField[];
  const apply = useApplyProposal(nodeId);
  const reject = useRejectProposal(nodeId);
  const toast = useToast();
  const { open } = useSelectedNode();

  // Everything starts selected; the user unchecks or edits.
  const [values, setValues] = useState<Partial<Record<PlanField, string>>>(p.update);
  const [selectedFields, setSelectedFields] = useState<Set<PlanField>>(new Set(fields));
  const [withParent, setWithParent] = useState(!!p.parent);
  const [children, setChildren] = useState(() => new Map(p.children.map((c) => [c.ref, c.title])));
  const [selectedChildren, setSelectedChildren] = useState<Set<string>>(new Set(p.children.map((c) => c.ref)));
  const [selectedRelations, setSelectedRelations] = useState<Set<number>>(new Set(p.relations.map((_, i) => i)));

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const nothingProposed = !fields.length && !p.parent && !p.children.length && !p.relations.length;
  const nothingSelected = !selectedFields.size && !withParent && !selectedChildren.size && !selectedRelations.size;

  function submit() {
    const update = Object.fromEntries([...selectedFields].map((f) => [f, values[f] ?? ''])) as Record<string, string>;
    apply.mutate(
      {
        id: proposal.id,
        update: update as never,
        parent: withParent,
        children: [...selectedChildren].map((ref) => ({ ref, title: (children.get(ref) ?? '').trim() })).filter((c) => c.title),
        relations: [...selectedRelations],
      },
      {
        onSuccess: () => toast({ message: 'Propuesta aplicada' }),
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  }

  const header = (
    <div className="flex items-start gap-2">
      <ListChecks className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
      <div>
        <p className="font-medium">{p.mode === 'reduce' ? 'Propuesta para reducirlo a pasos chicos' : 'Propuesta'}</p>
        {p.summary && <p className="text-muted">{p.summary}</p>}
      </div>
    </div>
  );

  if (proposal.status !== 'PENDING') {
    const r = proposal.result;
    return (
      <div className="rounded-lg border border-line px-3 py-2 text-sm">
        {header}
        {proposal.status === 'REJECTED' ? (
          <p className="mt-2 flex items-center gap-1 text-muted">
            <XCircle className="size-4" aria-hidden /> Descartada
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            <p className="flex items-center gap-1 text-ok">
              <CheckCircle2 className="size-4" aria-hidden /> {proposal.status === 'ACCEPTED' ? 'Aplicada completa' : 'Aplicada en parte'}
            </p>
            {r && r.updatedFields.length > 0 && (
              <p className="text-xs text-muted">Actualizado: {r.updatedFields.map((f) => FIELD_LABEL[f as PlanField] ?? f).join(', ')}</p>
            )}
            {r && r.created.length > 0 && (
              <ul className="text-xs">
                {r.created.map((c) => (
                  <li key={c.id}>
                    <button className="hover:underline" onClick={() => open(c.id)}>
                      + {c.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {r && r.relations > 0 && <p className="text-xs text-muted">{r.relations} relaciones creadas</p>}
            {r && r.skipped.length > 0 && (
              <ul className="text-xs text-warn">
                {r.skipped.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-accent/40 bg-accent/[0.03] px-3 py-3 text-sm" aria-label="Propuesta pendiente">
      {header}

      {fields.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="label">Cambios en este elemento</legend>
          {fields.map((field) => (
            <div key={field} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-2 size-4 accent-[var(--color-accent)]"
                checked={selectedFields.has(field)}
                onChange={() => setSelectedFields(toggle(selectedFields, field))}
                aria-label={`Aplicar ${FIELD_LABEL[field]}`}
              />
              <label className="min-w-0 flex-1">
                <span className="mb-0.5 flex items-center gap-1.5 text-xs text-muted">
                  {FIELD_LABEL[field]}
                  {p.inferred.includes(field) && (
                    <span className="rounded bg-warn/15 px-1 text-[10px] font-medium text-warn" title="La IA lo dedujo; no lo dijiste vos">
                      inferido
                    </span>
                  )}
                </span>
                {field === 'type' ? (
                  <select className="input py-1" value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })}>
                    {Object.entries(TYPE_LABEL)
                      .filter(([t]) => t !== 'INBOX_ITEM')
                      .map(([t, label]) => (
                        <option key={t} value={t}>
                          {label}
                        </option>
                      ))}
                  </select>
                ) : field === 'priority' ? (
                  <select className="input py-1" value={values.priority} onChange={(e) => setValues({ ...values, priority: e.target.value })}>
                    {(Object.keys(PRIORITY_LABEL) as Priority[]).map((pr) => (
                      <option key={pr} value={pr}>
                        {PRIORITY_LABEL[pr]}
                      </option>
                    ))}
                  </select>
                ) : MULTILINE.includes(field) ? (
                  <textarea className="input py-1" rows={2} value={values[field] ?? ''} onChange={(e) => setValues({ ...values, [field]: e.target.value })} />
                ) : (
                  <input className="input py-1" value={values[field] ?? ''} onChange={(e) => setValues({ ...values, [field]: e.target.value })} />
                )}
                {field === 'priority' && p.priorityReason && <span className="mt-0.5 block text-xs text-muted">{p.priorityReason}</span>}
              </label>
            </div>
          ))}
        </fieldset>
      )}

      {p.parent && (
        <fieldset>
          <legend className="label">Ubicar dentro de</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={withParent} onChange={() => setWithParent(!withParent)} />
            <TypeBadge type={p.parent.type} />
            {p.parent.title}
          </label>
        </fieldset>
      )}

      {p.children.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="label">Crear ({p.children.length})</legend>
          {p.children.map((c) => (
            <div key={c.ref} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-2 size-4 accent-[var(--color-accent)]"
                checked={selectedChildren.has(c.ref)}
                onChange={() => setSelectedChildren(toggle(selectedChildren, c.ref))}
                aria-label={`Crear ${c.title}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <TypeBadge type={c.type as NodeType} />
                  <input
                    className="input py-1"
                    value={children.get(c.ref) ?? ''}
                    onChange={(e) => setChildren(new Map(children).set(c.ref, e.target.value))}
                    aria-label={`Título de ${c.ref}`}
                  />
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {c.nextAction && <>Primer paso: {c.nextAction}</>}
                  {c.dependsOn.length > 0 && (
                    <> · después de {c.dependsOn.map((d) => children.get(d) ?? d).join(', ')}</>
                  )}
                </p>
              </div>
            </div>
          ))}
        </fieldset>
      )}

      {p.relations.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="label">Relacionar con lo que ya tenés</legend>
          {p.relations.map((r, i) => (
            <label key={`${r.nodeId}-${r.type}`} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--color-accent)]"
                checked={selectedRelations.has(i)}
                onChange={() => setSelectedRelations(toggle(selectedRelations, i))}
              />
              <span>
                <span className="text-xs text-muted">{r.direction === 'out' ? RELATION_RULES[r.type].label : RELATION_RULES[r.type].inverseLabel} </span>
                <TypeBadge type={r.nodeType} /> {r.title}
                {r.reason && <span className="block text-xs text-muted">{r.reason}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {nothingProposed && <p className="text-muted">No propone cambios: el elemento ya está bien definido.</p>}

      {(p.openQuestions.length > 0 || p.risks.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {p.openQuestions.length > 0 && (
            <div>
              <p className="label">Preguntas pendientes</p>
              <ul className="ml-4 list-disc text-xs">
                {p.openQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {p.risks.length > 0 && (
            <div>
              <p className="label">Riesgos y decisiones</p>
              <ul className="ml-4 list-disc text-xs">
                {p.risks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {proposal.warnings.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Ajustes que hizo el sistema ({proposal.warnings.length})</summary>
          <ul className="ml-4 mt-1 list-disc">
            {proposal.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={nothingSelected || apply.isPending} onClick={submit}>
          {apply.isPending ? 'Aplicando…' : 'Aplicar lo seleccionado'}
        </button>
        <button
          className="btn"
          disabled={reject.isPending}
          onClick={() => reject.mutate(proposal.id, { onError: (err) => toast({ message: errorMessage(err), tone: 'error' }) })}
        >
          Descartar
        </button>
      </div>
      <p className="text-[11px] text-muted">
        {proposal.provider === 'FAKE' ? 'Modo de prueba' : proposal.model} · revisá antes de aplicar: es una sugerencia.
      </p>
    </div>
  );
}

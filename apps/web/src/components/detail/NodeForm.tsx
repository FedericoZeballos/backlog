import { isActionable, PRIORITIES, type NodeDTO, type NodeType, type Priority, type UpdateNodeInput } from '@backlog/shared';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../../api/client';
import { invalidateGraph, useStatuses, useUpdateNode } from '../../api/hooks';
import { PRIORITY_LABEL, TYPE_LABEL, TYPE_ORDER } from '../../lib/labels';
import { useToast } from '../feedback';
import { useQueryClient } from '@tanstack/react-query';

interface FormState {
  type: NodeType;
  title: string;
  body: string;
  statusId: string;
  priority: Priority | '';
  dueDate: string;
  nextAction: string;
  outcome: string;
  doneCriteria: string;
  url: string;
}

function fromNode(n: NodeDTO): FormState {
  return {
    type: n.type,
    title: n.title,
    body: n.body,
    statusId: n.status?.id ?? '',
    priority: n.priority ?? '',
    dueDate: n.dueDate ?? '',
    nextAction: n.nextAction ?? '',
    outcome: n.outcome ?? '',
    doneCriteria: n.doneCriteria ?? '',
    url: n.url ?? '',
  };
}

const orNull = (s: string) => (s.trim() === '' ? null : s.trim());

/** Builds a PATCH with only the fields that changed. */
function diff(node: NodeDTO, initial: FormState, form: FormState): UpdateNodeInput {
  const patch: UpdateNodeInput = { version: node.version };
  if (form.type !== initial.type) patch.type = form.type;
  if (form.title !== initial.title) patch.title = form.title.trim();
  if (form.body !== initial.body) patch.body = form.body;
  if (form.statusId !== initial.statusId && isActionable(form.type)) patch.statusId = form.statusId || null;
  if (form.priority !== initial.priority) {
    patch.priority = form.priority || null;
    patch.prioritySource = form.priority ? 'USER' : null;
  }
  if (form.dueDate !== initial.dueDate) patch.dueDate = form.dueDate || null;
  if (form.nextAction !== initial.nextAction) patch.nextAction = orNull(form.nextAction);
  if (form.outcome !== initial.outcome) patch.outcome = orNull(form.outcome);
  if (form.doneCriteria !== initial.doneCriteria) patch.doneCriteria = orNull(form.doneCriteria);
  if (form.url !== initial.url) patch.url = orNull(form.url);
  return patch;
}

export function NodeForm({ node }: { node: NodeDTO }) {
  const initial = useMemo(() => fromNode(node), [node]);
  const [form, setForm] = useState(initial);
  // Reset when another node is opened or the server returns a newer version.
  useEffect(() => setForm(initial), [initial]);

  const { data: statuses } = useStatuses();
  const update = useUpdateNode();
  const toast = useToast();
  const qc = useQueryClient();

  const patch = diff(node, initial, form);
  const dirty = Object.keys(patch).length > 1;
  const actionable = isActionable(form.type);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function save(e: FormEvent) {
    e.preventDefault();
    if (!dirty || !form.title.trim()) return;
    update.mutate(
      { id: node.id, ...patch },
      {
        onSuccess: () => toast({ message: 'Cambios guardados' }),
        onError: (err) => {
          toast({ message: errorMessage(err), tone: 'error' });
          if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') invalidateGraph(qc);
        },
      },
    );
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <textarea
        className="input resize-none border-transparent bg-transparent px-0 text-lg font-semibold shadow-none focus:border-transparent focus:ring-0"
        value={form.title}
        onChange={(e) => set('title', e.target.value.replace(/\n/g, ' '))}
        rows={Math.min(4, Math.ceil(form.title.length / 38) || 1)}
        maxLength={300}
        aria-label="Título"
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <select className="input" value={form.type} onChange={(e) => set('type', e.target.value as NodeType)}>
            {(node.type === 'INBOX_ITEM' ? ['INBOX_ITEM' as const, ...TYPE_ORDER] : TYPE_ORDER).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        {actionable && (
          <Field label="Estado">
            <select className="input" value={form.statusId} onChange={(e) => set('statusId', e.target.value)}>
              {!form.statusId && <option value="">Por defecto</option>}
              {statuses?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {actionable && (
          <Field label="Prioridad">
            <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority | '')}>
              <option value="">Sin definir</option>
              {PRIORITIES.filter((p) => p !== 'NONE').map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
            {node.prioritySource === 'AI_SUGGESTED' && form.priority === initial.priority && (
              <p className="mt-1 text-[11px] text-warn">Sugerida por la IA, sin confirmar</p>
            )}
          </Field>
        )}
        {actionable && (
          <Field label="Fecha límite">
            <input type="date" className="input" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
        )}
      </div>

      {actionable && (
        <>
          <Field label="Próxima acción concreta">
            <input
              className="input"
              value={form.nextAction}
              onChange={(e) => set('nextAction', e.target.value)}
              placeholder="¿Qué es lo primero que harías?"
            />
          </Field>
          <Field label="Resultado esperado">
            <textarea className="input" rows={2} value={form.outcome} onChange={(e) => set('outcome', e.target.value)} />
          </Field>
          <Field label="Criterio de terminado">
            <textarea
              className="input"
              rows={2}
              value={form.doneCriteria}
              onChange={(e) => set('doneCriteria', e.target.value)}
              placeholder="¿Cómo sabés que está terminado?"
            />
          </Field>
        </>
      )}

      {form.type === 'RESOURCE' && (
        <Field label="Enlace">
          <input type="url" className="input" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
        </Field>
      )}

      <Field label="Descripción y notas (Markdown)">
        <textarea className="input font-mono text-[13px]" rows={6} value={form.body} onChange={(e) => set('body', e.target.value)} />
      </Field>

      <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-line bg-surface px-5 py-3">
        <button type="button" className="btn" disabled={!dirty} onClick={() => setForm(initial)}>
          Descartar
        </button>
        <button type="submit" className="btn btn-primary" disabled={!dirty || !form.title.trim() || update.isPending}>
          {update.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

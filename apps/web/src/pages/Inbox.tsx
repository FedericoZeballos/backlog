import type { NodeDTO, NodeType } from '@backlog/shared';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../api/client';
import { useDeleteNode, useNodes, useRestoreNode, useUpdateNode } from '../api/hooks';
import { useConfirm, useToast } from '../components/feedback';
import { EmptyState, Loading, NodeList, NodeRow, PageHeader, QueryError } from '../components/NodeList';
import { QuickCapture } from '../components/QuickCapture';
import { timeAgo } from '../lib/dates';
import { TYPE_LABEL } from '../lib/labels';

/** The types offered for quick classification, most common first. */
const CLASSIFY: NodeType[] = ['TASK', 'IDEA', 'PROJECT', 'PROBLEM', 'NOTE', 'GOAL', 'DECISION', 'RESOURCE', 'AREA'];

export function InboxPage() {
  const { data, isLoading, error } = useNodes({ processed: false, limit: 200 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const update = useUpdateNode();
  const del = useDeleteNode();
  const restore = useRestoreNode();
  const toast = useToast();
  const confirm = useConfirm();

  const items = data?.items ?? [];
  const chosen = items.filter((n) => selected.has(n.id));

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function classify(nodes: NodeDTO[], type: NodeType) {
    const results = await Promise.allSettled(nodes.map((n) => update.mutateAsync({ id: n.id, version: n.version, type })));
    const failed = results.filter((r) => r.status === 'rejected');
    setSelected(new Set());
    if (failed.length) toast({ message: errorMessage((failed[0] as PromiseRejectedResult).reason), tone: 'error' });
    else toast({ message: `${nodes.length > 1 ? `${nodes.length} elementos clasificados` : 'Clasificado'} como ${TYPE_LABEL[type].toLowerCase()}` });
  }

  async function remove(nodes: NodeDTO[]) {
    const ok = await confirm({
      title: nodes.length > 1 ? `¿Enviar ${nodes.length} elementos a la papelera?` : '¿Enviar a la papelera?',
      confirmLabel: 'Enviar a la papelera',
      danger: true,
    });
    if (!ok) return;
    await Promise.allSettled(nodes.map((n) => del.mutateAsync(n.id)));
    setSelected(new Set());
    toast({
      message: 'Enviado a la papelera',
      action: { label: 'Deshacer', onClick: () => nodes.forEach((n) => restore.mutate(n.id)) },
    });
  }

  return (
    <>
      <PageHeader title="Bandeja de entrada" subtitle="Capturá sin pensar; clasificá cuando tengas un momento." />
      <div className="mb-6">
        <QuickCapture autoFocus />
      </div>

      {chosen.length > 0 && (
        <div className="card mb-3 flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <span className="font-medium">{chosen.length} seleccionados</span>
          <ClassifyMenu onPick={(t) => classify(chosen, t)} label="Clasificar como…" />
          <button className="btn btn-danger" onClick={() => remove(chosen)}>
            <Trash2 className="size-4" aria-hidden /> Eliminar
          </button>
          <button className="btn btn-ghost ml-auto" onClick={() => setSelected(new Set())}>
            Cancelar
          </button>
        </div>
      )}

      {isLoading && <Loading />}
      {error && <QueryError error={error} />}
      {data && items.length === 0 && <EmptyState title="Bandeja vacía" hint="Todo lo que captures aparece acá hasta que lo clasifiques." />}
      {items.length > 0 && (
        <NodeList>
          {items.map((n) => (
            <NodeRow
              key={n.id}
              node={n}
              showType={false}
              leading={
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
                  checked={selected.has(n.id)}
                  onChange={() => toggleSelect(n.id)}
                  aria-label={`Seleccionar ${n.title}`}
                />
              }
              actions={
                <>
                  <span className="hidden text-xs text-muted sm:inline">{timeAgo(n.createdAt)}</span>
                  <ClassifyMenu onPick={(t) => classify([n], t)} label="Clasificar" />
                </>
              }
            />
          ))}
        </NodeList>
      )}
    </>
  );
}

function ClassifyMenu({ onPick, label }: { onPick: (t: NodeType) => void; label: string }) {
  return (
    <select
      className="input w-auto py-1 text-xs"
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value as NodeType)}
      aria-label={label}
    >
      <option value="">{label}</option>
      {CLASSIFY.map((t) => (
        <option key={t} value={t}>
          {TYPE_LABEL[t]}
        </option>
      ))}
    </select>
  );
}

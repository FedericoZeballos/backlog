import type { NodeType } from '@backlog/shared';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage } from '../api/client';
import { useNodes, usePurgeNode, useRestoreNode } from '../api/hooks';
import { useConfirm, useToast } from '../components/feedback';
import { EmptyState, Loading, NodeList, NodeRow, PageHeader, QueryError } from '../components/NodeList';
import { QuickCapture } from '../components/QuickCapture';
import { timeAgo } from '../lib/dates';
import { TYPE_LABEL } from '../lib/labels';

const NOTE_TYPES: NodeType[] = ['NOTE', 'DECISION', 'RESOURCE'];

export function NotesPage() {
  const [type, setType] = useState<NodeType | null>(null);
  const [newType, setNewType] = useState<NodeType>('NOTE');
  const { data, isLoading, error } = useNodes({ type: type ? [type] : NOTE_TYPES, limit: 300 });

  return (
    <>
      <PageHeader title="Notas y decisiones" subtitle="Conocimiento, decisiones tomadas y recursos de referencia." />
      <div className="mb-4 flex gap-2">
        <select className="input w-auto" value={newType} onChange={(e) => setNewType(e.target.value as NodeType)} aria-label="Tipo a crear">
          {NOTE_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <div className="flex-1">
          <QuickCapture type={newType} placeholder="Título…" />
        </div>
      </div>
      <div className="mb-4 flex gap-1.5" role="group" aria-label="Filtrar por tipo">
        {[null, ...NOTE_TYPES].map((t) => (
          <button
            key={t ?? 'all'}
            className={`rounded-full border px-3 py-1 text-xs ${t === type ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg'}`}
            aria-pressed={t === type}
            onClick={() => setType(t)}
          >
            {t ? TYPE_LABEL[t] : 'Todo'}
          </button>
        ))}
      </div>
      {isLoading && <Loading />}
      {error && <QueryError error={error} />}
      {data && data.items.length === 0 && <EmptyState title="Nada por acá todavía" />}
      {data && data.items.length > 0 && (
        <NodeList>
          {data.items.map((n) => (
            <NodeRow key={n.id} node={n} actions={<span className="text-xs text-muted">{timeAgo(n.updatedAt)}</span>} />
          ))}
        </NodeList>
      )}
    </>
  );
}

export function TrashPage() {
  const { data, isLoading, error } = useNodes({ deleted: true, archived: 'include', limit: 300 });
  const restore = useRestoreNode();
  const purge = usePurgeNode();
  const confirm = useConfirm();
  const toast = useToast();

  return (
    <>
      <PageHeader title="Papelera" subtitle="Lo eliminado se puede restaurar con sus relaciones." />
      {isLoading && <Loading />}
      {error && <QueryError error={error} />}
      {data && data.items.length === 0 && <EmptyState title="La papelera está vacía" />}
      {data && data.items.length > 0 && (
        <NodeList>
          {data.items.map((n) => (
            <NodeRow
              key={n.id}
              node={n}
              leading={<span className="mt-1.5 size-2 shrink-0 rounded-full bg-line" aria-hidden />}
              actions={
                <>
                  <button
                    className="btn px-2 py-1 text-xs"
                    onClick={() =>
                      restore.mutate(n.id, {
                        onSuccess: (r) =>
                          toast({
                            message: r.droppedRelations.length
                              ? `Restaurado. Se quitaron ${r.droppedRelations.length} relaciones que ya no eran válidas.`
                              : 'Restaurado',
                          }),
                        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
                      })
                    }
                  >
                    <RotateCcw className="size-3.5" aria-hidden /> Restaurar
                  </button>
                  <button
                    className="btn btn-danger px-2 py-1 text-xs"
                    onClick={async () => {
                      const ok = await confirm({
                        title: `¿Eliminar "${n.title}" definitivamente?`,
                        message: 'Se borran el elemento, sus relaciones y comentarios. No se puede deshacer.',
                        confirmLabel: 'Eliminar para siempre',
                        danger: true,
                      });
                      if (ok) purge.mutate(n.id);
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    <span className="sr-only">Eliminar definitivamente</span>
                  </button>
                </>
              }
            />
          ))}
        </NodeList>
      )}
    </>
  );
}

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const { data, isLoading, error } = useNodes({ q, archived: 'include', limit: 100 }, q.length > 0);

  return (
    <>
      <PageHeader title={`Resultados para “${q}”`} subtitle={data ? `${data.total} encontrados` : undefined} />
      {isLoading && <Loading />}
      {error && <QueryError error={error} />}
      {data && data.items.length === 0 && <EmptyState title="Sin resultados" hint="Probá con otra palabra; la búsqueda ignora tildes y mayúsculas." />}
      {data && data.items.length > 0 && (
        <NodeList>
          {data.items.map((n) => (
            <NodeRow key={n.id} node={n} />
          ))}
        </NodeList>
      )}
    </>
  );
}

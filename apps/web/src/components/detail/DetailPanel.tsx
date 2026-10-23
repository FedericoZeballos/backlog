import { Archive, ArchiveRestore, Focus, Network, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../api/client';
import { useDeleteNode, useNode, usePurgeNode, useRestoreNode, useUpdateNode } from '../../api/hooks';
import { formatDateTime } from '../../lib/dates';
import { useSelectedNode, type PanelTab } from '../../lib/selection';
import { Assistant } from '../assistant/Assistant';
import { TypeBadge } from '../badges';
import { useConfirm, useToast } from '../feedback';
import { Comments } from './Comments';
import { Hierarchy } from './Hierarchy';
import { History } from './History';
import { NodeForm } from './NodeForm';
import { Relations } from './Relations';

const TABS = [
  { id: 'detail', label: 'Detalle' },
  { id: 'assistant', label: 'Asistente' },
  { id: 'relations', label: 'Relaciones' },
  { id: 'comments', label: 'Comentarios' },
  { id: 'history', label: 'Historial' },
] as const satisfies readonly { id: PanelTab; label: string }[];

/** Side panel for the node in `?node=`; available from every view. */
export function DetailPanel() {
  const { id, close, tab: requestedTab } = useSelectedNode();
  const [tab, setTab] = useState<PanelTab>('detail');
  const { data, error, isLoading } = useNode(id);
  useEffect(() => setTab(requestedTab ?? 'detail'), [id, requestedTab]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role="dialog"]') && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, close]);

  if (!id) return null;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l border-line bg-surface shadow-2xl md:w-[480px]"
      aria-label="Detalle del elemento"
    >
      <header className="flex items-center gap-2 border-b border-line px-5 py-3">
        {data && <TypeBadge type={data.node.type} />}
        {data && <span className="truncate text-xs text-muted">Creado {formatDateTime(data.node.createdAt)}</span>}
        <button className="btn btn-ghost ml-auto px-1.5" onClick={close} title="Cerrar (Esc)">
          <X className="size-4" aria-hidden />
          <span className="sr-only">Cerrar</span>
        </button>
      </header>

      {isLoading && <p className="p-5 text-sm text-muted">Cargando…</p>}
      {error && (
        <div className="p-5 text-sm">
          <p className="text-danger">{errorMessage(error)}</p>
          <button className="btn mt-3" onClick={close}>
            Cerrar
          </button>
        </div>
      )}

      {data && (
        <>
          {data.node.deletedAt && <TrashBanner nodeId={data.node.id} />}
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`border-b-2 px-2.5 py-2 text-sm ${tab === t.id ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg'}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === 'relations' && data.relations.length > 0 && (
                  <span className="ml-1 text-xs text-muted">{data.relations.filter((r) => r.category !== 'STRUCTURAL').length || ''}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto px-5 pt-4">
            {tab === 'detail' && (
              <div className="space-y-6">
                <NodeForm node={data.node} />
                <Hierarchy node={data.node} relations={data.relations} />
                {!data.node.deletedAt && <NodeActions nodeId={data.node.id} version={data.node.version} archived={!!data.node.archivedAt} />}
              </div>
            )}
            {tab === 'assistant' && <Assistant key={data.node.id} node={data.node} />}
            {tab === 'relations' && <Relations node={data.node} relations={data.relations} />}
            {tab === 'comments' && <Comments nodeId={data.node.id} />}
            {tab === 'history' && <History nodeId={data.node.id} />}
            <div className="h-6" />
          </div>
        </>
      )}
    </aside>
  );
}

function NodeActions({ nodeId, version, archived }: { nodeId: string; version: number; archived: boolean }) {
  const del = useDeleteNode();
  const restore = useRestoreNode();
  const update = useUpdateNode();
  const confirm = useConfirm();
  const toast = useToast();
  const { close } = useSelectedNode();

  async function remove() {
    const ok = await confirm({
      title: '¿Enviar a la papelera?',
      message: 'Sus relaciones se ocultan y vuelven si lo restaurás.',
      confirmLabel: 'Enviar a la papelera',
      danger: true,
    });
    if (!ok) return;
    del.mutate(nodeId, {
      onSuccess: () => {
        close();
        toast({ message: 'Enviado a la papelera', action: { label: 'Deshacer', onClick: () => restore.mutate(nodeId) } });
      },
      onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
    });
  }

  return (
    <div className="flex flex-wrap gap-2 border-t border-line pt-4">
      <Link className="btn" to={`/focus/${nodeId}`}>
        <Focus className="size-4" aria-hidden /> Modo foco
      </Link>
      <Link className="btn" to={`/graph?focus=${nodeId}&depth=1&node=${nodeId}`}>
        <Network className="size-4" aria-hidden /> Ver en el grafo
      </Link>
      <button
        className="btn"
        onClick={() =>
          update.mutate(
            { id: nodeId, version, archived: !archived },
            { onError: (err) => toast({ message: errorMessage(err), tone: 'error' }) },
          )
        }
      >
        {archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
        {archived ? 'Desarchivar' : 'Archivar'}
      </button>
      <button className="btn btn-danger ml-auto" onClick={remove}>
        <Trash2 className="size-4" aria-hidden /> Eliminar
      </button>
    </div>
  );
}

function TrashBanner({ nodeId }: { nodeId: string }) {
  const restore = useRestoreNode();
  const purge = usePurgeNode();
  const confirm = useConfirm();
  const toast = useToast();
  const { close } = useSelectedNode();

  return (
    <div className="flex items-center gap-2 border-b border-warn/30 bg-warn/10 px-5 py-2 text-sm">
      <span className="flex-1">Está en la papelera.</span>
      <button
        className="btn"
        onClick={() =>
          restore.mutate(nodeId, {
            onSuccess: (r) =>
              toast({
                message: r.droppedRelations.length
                  ? `Restaurado. Se quitaron ${r.droppedRelations.length} relaciones que ya no eran válidas.`
                  : 'Restaurado',
              }),
          })
        }
      >
        Restaurar
      </button>
      <button
        className="btn btn-danger"
        onClick={async () => {
          const ok = await confirm({
            title: '¿Eliminar definitivamente?',
            message: 'Se borran el elemento, sus relaciones y comentarios. No se puede deshacer.',
            confirmLabel: 'Eliminar para siempre',
            danger: true,
          });
          if (ok) purge.mutate(nodeId, { onSuccess: close });
        }}
      >
        Eliminar
      </button>
    </div>
  );
}

import {
  EDGE_CATEGORIES,
  RELATION_RULES,
  type EdgeCategory,
  type EdgeDTO,
  type GraphNodeDTO,
  type NodeBrief,
  type NodeType,
} from '@backlog/shared';
import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeMouseHandler,
  type OnSelectionChangeFunc,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, Crosshair, LayoutGrid, ListTree, Plus, Search, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage } from '../api/client';
import {
  useCreateNode,
  useDeleteEdge,
  useDeleteNode,
  useGraph,
  useGraphIssues,
  useResetLayout,
  useRestoreNode,
  useSaveLayout,
} from '../api/hooks';
import { Modal, useConfirm, useToast } from '../components/feedback';
import { ConnectDialog } from '../graph/ConnectDialog';
import { GraphNode, type FlowNode } from '../graph/GraphNode';
import { IssuesPanel } from '../graph/IssuesPanel';
import { autoLayout, NODE_HEIGHT, NODE_WIDTH, placeMissing, type Positions } from '../graph/layout';
import { TYPE_LABEL, TYPE_ORDER } from '../lib/labels';
import { useSelectedNode } from '../lib/selection';

const nodeTypes = { item: GraphNode };

const CATEGORY_LABEL: Record<EdgeCategory, string> = {
  STRUCTURAL: 'Estructura',
  EXECUTION: 'Dependencias',
  CONCEPTUAL: 'Conceptuales',
};

// SVG marker colors cannot use CSS variables.
const DEPENDENCY_COLOR = '#d97706';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function toFlowEdge(e: EdgeDTO, selected: boolean): Edge {
  const highlight = selected ? { stroke: 'var(--color-accent)', strokeWidth: 3 } : {};
  const label = e.category === 'STRUCTURAL' ? undefined : RELATION_RULES[e.type].label;
  const common = {
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    label,
    labelStyle: { fontSize: 10, fill: 'var(--color-muted)' },
    labelBgStyle: { fill: 'var(--color-bg)' },
    labelBgPadding: [4, 2] as [number, number],
    interactionWidth: 16,
  };
  if (e.category === 'STRUCTURAL') {
    return { ...common, type: 'smoothstep', style: { stroke: 'var(--color-muted)', strokeWidth: 1.5, ...highlight } };
  }
  if (e.category === 'EXECUTION') {
    return {
      ...common,
      style: { stroke: DEPENDENCY_COLOR, strokeWidth: 2, ...highlight },
      markerEnd: { type: MarkerType.ArrowClosed, color: DEPENDENCY_COLOR, width: 16, height: 16 },
    };
  }
  return { ...common, style: { stroke: 'var(--color-muted)', strokeWidth: 1.2, strokeDasharray: '5 4', ...highlight } };
}

export function GraphPage() {
  return (
    <ReactFlowProvider>
      <GraphView />
    </ReactFlowProvider>
  );
}

function GraphView() {
  const [params, setParams] = useSearchParams();
  const focus = useMemo(() => params.get('focus')?.split(',').filter(Boolean) ?? [], [params]);
  const depth = Number(params.get('depth') ?? 1);
  const { id: selectedId, open } = useSelectedNode();

  const [types, setTypes] = useState<NodeType[]>([]);
  const [categories, setCategories] = useState<EdgeCategory[]>([]);
  const [hideDone, setHideDone] = useState(false);
  const [search, setSearch] = useState('');
  const [showIssues, setShowIssues] = useState(false);
  const [connecting, setConnecting] = useState<{ a: NodeBrief; b: NodeBrief } | null>(null);
  const [creatingAt, setCreatingAt] = useState<{ x: number; y: number } | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<EdgeDTO | null>(null);
  const [multi, setMulti] = useState<string[]>([]);

  const viewKey = focus.length ? `focus:${focus[0]}` : 'global';
  const { data, isLoading, error } = useGraph({
    focus,
    depth,
    type: types.length ? types : undefined,
    category: categories.length ? categories : undefined,
    hideDone,
    viewKey,
  });
  const issues = useGraphIssues(showIssues);
  const saveLayout = useSaveLayout();
  const resetLayout = useResetLayout();
  const deleteEdge = useDeleteEdge();
  const deleteNode = useDeleteNode();
  const restoreNode = useRestoreNode();
  const confirm = useConfirm();
  const toast = useToast();
  const { setCenter, fitView, getZoom, screenToFlowPosition } = useReactFlow();

  const [positions, setPositions] = useState<Positions>({});
  // Positions on screen for the current view, so refetches never make nodes jump.
  const local = useRef<{ viewKey: string; positions: Positions; fitted: boolean }>({ viewKey, positions: {}, fitted: false });
  if (local.current.viewKey !== viewKey) local.current = { viewKey, positions: {}, fitted: false };

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const lastClicked = useRef<string | null>(null);

  const setFocus = useCallback(
    (ids: string[], newDepth = depth) =>
      setParams((p) => {
        if (ids.length) p.set('focus', ids.join(','));
        else p.delete('focus');
        p.set('depth', String(newDepth));
        return p;
      }),
    [setParams, depth],
  );

  const expand = useCallback((id: string) => setFocus(focus.length ? [...new Set([...focus, id])] : [id]), [focus, setFocus]);

  // Lay out whatever has no position yet, keeping everything else where it is.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      const ids = data.nodes.map((n) => n.id);
      const known: Positions = { ...local.current.positions, ...data.positions };
      const hasAny = ids.some((id) => known[id]);
      const next = hasAny ? placeMissing(ids, data.edges, known) : await autoLayout(ids, data.edges);
      if (cancelled) return;
      local.current.positions = { ...local.current.positions, ...next };
      setPositions(next);
      const unsaved = ids.filter((id) => !data.positions[id]);
      if (unsaved.length) saveLayout.mutate({ viewKey, positions: unsaved.map((id) => ({ nodeId: id, ...next[id]! })) });
    })();
    return () => {
      cancelled = true;
    };
    // Only re-run for new data or another view; saveLayout is a stable mutation.
  }, [data, viewKey]);

  const term = normalize(search.trim());
  const matches = useMemo(
    () => (term ? (data?.nodes ?? []).filter((n) => normalize(n.title).includes(term)) : []),
    [data, term],
  );

  useEffect(() => {
    if (!data) return;
    setNodes((prev) => {
      const selected = new Set(prev.filter((n) => n.selected).map((n) => n.id));
      return data.nodes
        .filter((n) => positions[n.id])
        .map((n: GraphNodeDTO) => ({
          id: n.id,
          type: 'item' as const,
          position: positions[n.id]!,
          selected: selected.has(n.id),
          data: {
            node: n,
            dimmed: !!term && !normalize(n.title).includes(term),
            isFocus: focus.includes(n.id) || n.id === selectedId,
            onExpand: expand,
          },
        }));
    });
  }, [data, positions, term, focus, selectedId, expand, setNodes]);

  // Fit once per view, after its first layout.
  useEffect(() => {
    if (nodes.length && !local.current.fitted) {
      local.current.fitted = true;
      requestAnimationFrame(() => fitView({ padding: 0.2, maxZoom: 1.2 }));
    }
  }, [nodes.length, fitView]);

  // Selecting something elsewhere (panel, issues) centers it in the graph.
  useEffect(() => {
    if (!selectedId || selectedId === lastClicked.current) return;
    const p = positions[selectedId];
    if (p) setCenter(p.x + NODE_WIDTH / 2, p.y + NODE_HEIGHT / 2, { zoom: Math.max(getZoom(), 0.9), duration: 400 });
  }, [selectedId, positions, setCenter, getZoom]);

  const edges = useMemo(() => (data?.edges ?? []).map((e) => toFlowEdge(e, selectedEdge?.id === e.id)), [data, selectedEdge]);
  const nodeById = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data]);

  const onNodeClick: NodeMouseHandler<FlowNode> = (_e, node) => {
    lastClicked.current = node.id;
    setSelectedEdge(null);
    open(node.id);
  };

  const onNodeDragStop = (_e: unknown, _node: FlowNode, dragged: FlowNode[]) => {
    const moved = Object.fromEntries(dragged.map((n) => [n.id, n.position]));
    local.current.positions = { ...local.current.positions, ...moved };
    setPositions((p) => ({ ...p, ...moved }));
    saveLayout.mutate({ viewKey, positions: dragged.map((n) => ({ nodeId: n.id, ...n.position })) });
  };

  const onConnect = (c: Connection) => {
    const a = nodeById.get(c.source);
    const b = nodeById.get(c.target);
    if (a && b && a.id !== b.id) setConnecting({ a, b });
  };

  const onSelectionChange: OnSelectionChangeFunc = useCallback(({ nodes: sel }) => setMulti(sel.map((n) => n.id)), []);

  function onDoubleClick(e: MouseEvent) {
    if (!(e.target as Element).closest('.react-flow__pane')) return;
    setCreatingAt(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }

  async function removeEdge(edge: EdgeDTO) {
    const ok = await confirm({ title: '¿Quitar esta relación?', confirmLabel: 'Quitar', danger: true });
    if (!ok) return;
    deleteEdge.mutate(edge.id, {
      onSuccess: () => {
        setSelectedEdge(null);
        toast({ message: 'Relación quitada' });
      },
      onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
    });
  }

  async function trashSelected() {
    const ok = await confirm({
      title: `¿Enviar ${multi.length} elementos a la papelera?`,
      message: 'Sus relaciones se ocultan y vuelven si los restaurás.',
      confirmLabel: 'Enviar a la papelera',
      danger: true,
    });
    if (!ok) return;
    const ids = [...multi];
    await Promise.allSettled(ids.map((id) => deleteNode.mutateAsync(id)));
    toast({ message: 'Enviados a la papelera', action: { label: 'Deshacer', onClick: () => ids.forEach((id) => restoreNode.mutate(id)) } });
  }

  function relayout() {
    local.current = { viewKey, positions: {}, fitted: false };
    setPositions({});
    resetLayout.mutate(viewKey);
  }

  function selectFromIssue(n: NodeBrief) {
    lastClicked.current = null;
    if (!nodeById.has(n.id)) setFocus([n.id], 1);
    open(n.id);
  }

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const selectedMissing = selectedId && data && !nodeById.has(selectedId);
  const edgeSource = selectedEdge && nodeById.get(selectedEdge.sourceId);
  const edgeTarget = selectedEdge && nodeById.get(selectedEdge.targetId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <h1 className="mr-1 text-base font-semibold">Grafo</h1>

        <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="Vista">
          <button className={`rounded px-2 py-1 text-xs ${!focus.length ? 'bg-accent/10 text-accent' : 'text-muted'}`} onClick={() => setFocus([])}>
            Todo
          </button>
          <button
            className={`rounded px-2 py-1 text-xs disabled:opacity-40 ${focus.length ? 'bg-accent/10 text-accent' : 'text-muted'}`}
            disabled={!selectedId && !focus.length}
            onClick={() => selectedId && setFocus([selectedId])}
            title="Mostrar solo el elemento seleccionado y sus conexiones"
          >
            <Crosshair className="mr-1 inline size-3" aria-hidden />
            Enfocado
          </button>
        </div>
        {focus.length > 0 && (
          <label className="flex items-center gap-1 text-xs text-muted">
            Saltos
            <select className="input w-auto py-0.5 text-xs" value={depth} onChange={(e) => setFocus(focus, Number(e.target.value))}>
              {[1, 2, 3, 4].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="input w-44 py-1 pl-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) {
                lastClicked.current = null;
                open(matches[0].id);
              }
            }}
            placeholder="Buscar y resaltar…"
            aria-label="Buscar en el grafo"
          />
          {term && <span className="ml-1 text-xs text-muted">{matches.length}</span>}
        </div>

        <details className="relative">
          <summary className="btn cursor-pointer list-none py-1 text-xs">
            Filtros{types.length + categories.length + (hideDone ? 1 : 0) ? ` (${types.length + categories.length + (hideDone ? 1 : 0)})` : ''}
          </summary>
          <div className="card absolute left-0 top-full z-20 mt-1 w-64 space-y-3 p-3 shadow-lg">
            <fieldset>
              <legend className="label">Tipos</legend>
              <div className="flex flex-wrap gap-1">
                {TYPE_ORDER.map((t) => (
                  <button
                    key={t}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${types.includes(t) ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted'}`}
                    aria-pressed={types.includes(t)}
                    onClick={() => setTypes(toggle(types, t))}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">Relaciones</legend>
              <div className="flex flex-wrap gap-1">
                {EDGE_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${categories.includes(c) ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted'}`}
                    aria-pressed={categories.includes(c)}
                    onClick={() => setCategories(toggle(categories, c))}
                  >
                    {CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="accent-[var(--color-accent)]" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
              Ocultar completadas
            </label>
          </div>
        </details>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button className="btn py-1 text-xs" onClick={() => setCreatingAt(screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))}>
            <Plus className="size-3.5" aria-hidden /> Nodo
          </button>
          <button className={`btn py-1 text-xs ${showIssues ? 'border-accent text-accent' : ''}`} onClick={() => setShowIssues(!showIssues)}>
            <AlertTriangle className="size-3.5" aria-hidden /> Revisar
          </button>
          <button className="btn py-1 text-xs" onClick={relayout} title="Volver a ordenar automáticamente esta vista">
            <LayoutGrid className="size-3.5" aria-hidden /> Reordenar
          </button>
          <Link className="btn py-1 text-xs" to="/projects" title="Ver la misma estructura como árbol">
            <ListTree className="size-3.5" aria-hidden /> Árbol
          </Link>
        </div>
      </div>

      <div className="relative min-h-0 flex-1" onDoubleClick={onDoubleClick}>
        {error && <p className="p-4 text-sm text-danger">{errorMessage(error)}</p>}
        {data && data.nodes.length === 0 && !isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="card max-w-sm p-5 text-center">
              <p className="text-sm font-medium">Nada para mostrar</p>
              <p className="mt-1 text-sm text-muted">
                Clasificá elementos de la bandeja o hacé doble click en el lienzo para crear uno.
              </p>
            </div>
          </div>
        )}

        <ReactFlow<FlowNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onEdgeClick={(_e, edge) => setSelectedEdge(data?.edges.find((x) => x.id === edge.id) ?? null)}
          onPaneClick={() => setSelectedEdge(null)}
          onSelectionChange={onSelectionChange}
          connectionMode={ConnectionMode.Loose}
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          minZoom={0.1}
          maxZoom={2}
          colorMode="system"
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!hidden md:!block" />
        </ReactFlow>

        {showIssues && <IssuesPanel issues={issues.data ?? []} onSelect={selectFromIssue} onClose={() => setShowIssues(false)} />}

        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-2 px-4">
          {data?.truncated && (
            <p className="pointer-events-auto card px-3 py-1.5 text-xs text-warn">
              Hay demasiados elementos para la vista completa. Enfocate en uno para ver el resto.
            </p>
          )}
          {selectedMissing && (
            <p className="pointer-events-auto card flex items-center gap-2 px-3 py-1.5 text-xs">
              El elemento abierto no está en esta vista.
              <button className="font-medium text-accent" onClick={() => expand(selectedId)}>
                Mostrarlo
              </button>
            </p>
          )}
          {multi.length > 1 && (
            <div className="pointer-events-auto card flex items-center gap-2 px-3 py-1.5 text-xs">
              <span className="font-medium">{multi.length} seleccionados</span>
              <button className="btn py-0.5 text-xs" onClick={() => setFocus(multi)}>
                <Crosshair className="size-3" aria-hidden /> Enfocar
              </button>
              <button className="btn btn-danger py-0.5 text-xs" onClick={trashSelected}>
                <Trash2 className="size-3" aria-hidden /> Eliminar
              </button>
            </div>
          )}
          {selectedEdge && edgeSource && edgeTarget && (
            <div className="pointer-events-auto card flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs" role="status">
              <span>
                <strong>{edgeSource.title}</strong> {RELATION_RULES[selectedEdge.type].label} <strong>{edgeTarget.title}</strong>
              </span>
              <button className="btn btn-danger py-0.5 text-xs" onClick={() => removeEdge(selectedEdge)}>
                Quitar relación
              </button>
              <button className="btn btn-ghost px-1" onClick={() => setSelectedEdge(null)}>
                <X className="size-3.5" aria-hidden />
                <span className="sr-only">Cerrar</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {connecting && <ConnectDialog a={connecting.a} b={connecting.b} onClose={() => setConnecting(null)} />}
      {creatingAt && (
        <CreateNodeDialog
          onClose={() => setCreatingAt(null)}
          onCreated={(id) => {
            local.current.positions[id] = creatingAt;
            saveLayout.mutate({ viewKey, positions: [{ nodeId: id, ...creatingAt }] });
            if (focus.length) setFocus([...focus, id]);
            lastClicked.current = id;
            open(id);
            setCreatingAt(null);
          }}
        />
      )}
    </div>
  );
}

function CreateNodeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<NodeType>('TASK');
  const create = useCreateNode();
  const toast = useToast();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), type },
      { onSuccess: (node) => onCreated(node.id), onError: (err) => toast({ message: errorMessage(err), tone: 'error' }) },
    );
  }

  return (
    <Modal onClose={onClose} labelledBy="new-node-title">
      <h2 id="new-node-title" className="text-base font-semibold">
        Nuevo nodo
      </h2>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" aria-label="Título del nodo" autoFocus />
        <select className="input" value={type} onChange={(e) => setType(e.target.value as NodeType)} aria-label="Tipo del nodo">
          {TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={!title.trim() || create.isPending}>
            Crear
          </button>
        </div>
      </form>
    </Modal>
  );
}

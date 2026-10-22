import type { NodeType } from '@backlog/shared';
import { useMemo, useState } from 'react';
import { useTree } from '../api/hooks';
import { EmptyState, Loading, PageHeader, QueryError } from '../components/NodeList';
import { QuickCapture } from '../components/QuickCapture';
import { buildTree, ProgressBar, progressOf, Tree } from '../components/Tree';
import { useSelectedNode } from '../lib/selection';

function ShowDoneToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted">
      <input type="checkbox" className="accent-[var(--color-accent)]" checked={value} onChange={(e) => onChange(e.target.checked)} />
      Mostrar completadas
    </label>
  );
}

const NEW_TYPES: { type: NodeType; label: string }[] = [
  { type: 'PROJECT', label: 'Proyecto' },
  { type: 'AREA', label: 'Área de responsabilidad' },
  { type: 'GOAL', label: 'Objetivo' },
];

/** Everything with structure (areas, goals, projects, tasks) as a tree, rooted at top-level nodes. */
export function ProjectsPage() {
  const { data, isLoading, error } = useTree();
  const [showDone, setShowDone] = useState(false);
  const [newType, setNewType] = useState<NodeType>('PROJECT');
  const index = useMemo(() => buildTree(data ?? []), [data]);

  // Loose tasks (no parent) live in the backlog, not here.
  const roots = (index.children.get(null) ?? []).filter(
    (n) => n.type !== 'TASK' && (showDone || n.status?.category !== 'DONE'),
  );

  return (
    <>
      <PageHeader title="Proyectos" subtitle="Áreas, objetivos y proyectos con sus tareas.">
        <ShowDoneToggle value={showDone} onChange={setShowDone} />
      </PageHeader>
      <div className="mb-5 flex gap-2">
        <select className="input w-auto" value={newType} onChange={(e) => setNewType(e.target.value as NodeType)} aria-label="Tipo a crear">
          {NEW_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="flex-1">
          <QuickCapture type={newType} placeholder="Nombre…" />
        </div>
      </div>
      {isLoading && <Loading />}
      {error && <QueryError error={error} />}
      {data && roots.length === 0 && <EmptyState title="Todavía no hay proyectos" hint="Creá uno arriba o clasificá algo de la bandeja como proyecto." />}
      {roots.length > 0 && <Tree index={index} roots={roots} showDone={showDone} />}
    </>
  );
}

export function GoalsPage() {
  const { data, isLoading, error } = useTree();
  const [showDone, setShowDone] = useState(false);
  const { open } = useSelectedNode();
  const index = useMemo(() => buildTree(data ?? []), [data]);
  const goals = (data ?? []).filter((n) => n.type === 'GOAL' && (showDone || n.status?.category !== 'DONE'));

  return (
    <>
      <PageHeader title="Objetivos" subtitle="Lo que querés lograr y cómo avanza.">
        <ShowDoneToggle value={showDone} onChange={setShowDone} />
      </PageHeader>
      <div className="mb-5">
        <QuickCapture type="GOAL" placeholder="Nuevo objetivo…" />
      </div>
      {isLoading && <Loading />}
      {error && <QueryError error={error} />}
      {data && goals.length === 0 && <EmptyState title="Sin objetivos" hint="Un objetivo agrupa proyectos y tareas hacia un resultado." />}
      <div className="space-y-4">
        {goals.map((g) => {
          const kids = (index.children.get(g.id) ?? []).filter((c) => showDone || c.status?.category !== 'DONE');
          const parent = g.parentId ? index.byId.get(g.parentId) : null;
          return (
            <section key={g.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <button className="text-left text-[15px] font-semibold hover:underline" onClick={() => open(g.id)}>
                  {g.title}
                </button>
                {parent && <span className="text-xs text-muted">en {parent.title}</span>}
                <span className="ml-auto">
                  <ProgressBar {...progressOf(index, g.id)} />
                </span>
              </div>
              {g.outcome && <p className="mt-1 text-sm text-muted">{g.outcome}</p>}
              {kids.length > 0 ? (
                <div className="mt-3">
                  <Tree index={index} roots={kids} showDone={showDone} depth={1} />
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted">Sin proyectos ni tareas todavía. Abrilo para agregarlos.</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

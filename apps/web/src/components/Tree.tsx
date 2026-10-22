import type { NodeType, TreeNodeDTO } from '@backlog/shared';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSelectedNode } from '../lib/selection';
import { DueChip, StatusPill, TypeBadge } from './badges';
import { CompleteCheckbox } from './CompleteCheckbox';

export interface TreeIndex {
  byId: Map<string, TreeNodeDTO>;
  children: Map<string | null, TreeNodeDTO[]>;
}

export function buildTree(nodes: TreeNodeDTO[]): TreeIndex {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string | null, TreeNodeDTO[]>();
  for (const n of nodes) {
    const key = n.parentId && byId.has(n.parentId) ? n.parentId : null;
    children.set(key, [...(children.get(key) ?? []), n]);
  }
  return { byId, children };
}

/** Done / total tasks anywhere below `id`. */
export function progressOf(index: TreeIndex, id: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  const stack = [...(index.children.get(id) ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.type === 'TASK') {
      total++;
      if (n.status?.category === 'DONE') done++;
    }
    stack.push(...(index.children.get(n.id) ?? []));
  }
  return { done, total };
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  if (!total) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted" title={`${done} de ${total} tareas`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-subtle">
        <span className="block h-full bg-ok" style={{ width: `${pct}%` }} />
      </span>
      {done}/{total}
    </span>
  );
}

interface TreeProps {
  index: TreeIndex;
  roots: TreeNodeDTO[];
  showDone: boolean;
  /** Levels expanded initially. */
  depth?: number;
}

export function Tree({ index, roots, showDone, depth = 2 }: TreeProps) {
  return (
    <ul className="card overflow-hidden py-1" role="tree">
      {roots.map((n) => (
        <TreeItem key={n.id} node={n} index={index} level={0} showDone={showDone} openDepth={depth} />
      ))}
    </ul>
  );
}

const ORDER: NodeType[] = ['AREA', 'GOAL', 'PROJECT', 'TASK'];

function TreeItem({
  node,
  index,
  level,
  showDone,
  openDepth,
}: {
  node: TreeNodeDTO;
  index: TreeIndex;
  level: number;
  showDone: boolean;
  openDepth: number;
}) {
  const [open, setOpen] = useState(level < openDepth - 1);
  const { id: selectedId, open: select } = useSelectedNode();

  const kids = useMemo(
    () =>
      (index.children.get(node.id) ?? [])
        .filter((c) => showDone || c.status?.category !== 'DONE')
        .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type)),
    [index, node.id, showDone],
  );
  const done = node.status?.category === 'DONE';
  const progress = node.type !== 'TASK' ? progressOf(index, node.id) : null;

  return (
    <li role="treeitem" aria-expanded={kids.length ? open : undefined}>
      <div
        className={`flex items-center gap-2 py-1.5 pr-3 ${selectedId === node.id ? 'bg-accent/8' : 'hover:bg-subtle/60'}`}
        style={{ paddingLeft: 8 + level * 20 }}
      >
        <button
          className={`size-5 shrink-0 text-muted ${kids.length ? '' : 'invisible'}`}
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Contraer' : 'Expandir'}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        {node.type === 'TASK' ? (
          <CompleteCheckbox node={node} />
        ) : (
          <TypeBadge type={node.type} />
        )}
        <button
          className={`min-w-0 flex-1 truncate text-left text-sm ${done ? 'text-muted line-through' : node.type !== 'TASK' ? 'font-medium' : ''}`}
          onClick={() => select(node.id)}
        >
          {node.title}
        </button>
        {node.status && node.status.category !== 'TODO' && !done && <StatusPill status={node.status} />}
        {node.dueDate && !done && <DueChip date={node.dueDate} />}
        {progress && <ProgressBar {...progress} />}
      </div>
      {open && kids.length > 0 && (
        <ul role="group">
          {kids.map((c) => (
            <TreeItem key={c.id} node={c} index={index} level={level + 1} showDone={showDone} openDepth={openDepth} />
          ))}
        </ul>
      )}
    </li>
  );
}

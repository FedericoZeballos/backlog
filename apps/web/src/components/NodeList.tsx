import { isActionable, type NodeBrief, type NodeDTO } from '@backlog/shared';
import { ChevronRight, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSelectedNode } from '../lib/selection';
import { DueChip, PriorityFlag, StatusPill, TypeBadge } from './badges';
import { CompleteCheckbox } from './CompleteCheckbox';

type RowNode = NodeDTO & { parent?: NodeBrief | null; blockers?: NodeBrief[] };

interface RowProps {
  node: RowNode;
  showType?: boolean;
  showParent?: boolean;
  /** Extra controls on the right (e.g. inbox classification). */
  actions?: ReactNode;
  /** Leading control replacing the completion checkbox (e.g. bulk selection). */
  leading?: ReactNode;
}

export function NodeRow({ node, showType = true, showParent = true, actions, leading }: RowProps) {
  const { id: selectedId, open } = useSelectedNode();
  const done = node.status?.category === 'DONE';
  const actionable = isActionable(node.type);

  return (
    <li
      className={`group flex items-start gap-3 border-b border-line px-3 py-2.5 last:border-b-0 ${
        selectedId === node.id ? 'bg-accent/8' : 'hover:bg-subtle/60'
      }`}
    >
      {leading ??
        (actionable ? (
          <CompleteCheckbox node={node} className="mt-0.5" />
        ) : (
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-line" aria-hidden />
        ))}

      <button className="min-w-0 flex-1 text-left" onClick={() => open(node.id)}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`text-sm ${done ? 'text-muted line-through' : ''}`}>{node.title}</span>
          {node.priority && <PriorityFlag priority={node.priority} suggested={node.prioritySource === 'AI_SUGGESTED'} />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {showType && <TypeBadge type={node.type} />}
          {node.status && node.status.category !== 'TODO' && <StatusPill status={node.status} />}
          {node.dueDate && !done && <DueChip date={node.dueDate} />}
          {showParent && node.parent && (
            <span className="inline-flex items-center gap-0.5">
              <ChevronRight className="size-3" aria-hidden />
              {node.parent.title}
            </span>
          )}
          {node.nextAction && !done && <span className="truncate">Siguiente: {node.nextAction}</span>}
        </div>
        {node.blockers && node.blockers.length > 0 && (
          <div className="mt-1 flex items-center gap-1 text-xs text-warn">
            <Lock className="size-3" aria-hidden />
            Espera a: {node.blockers.map((b) => b.title).join(', ')}
          </div>
        )}
      </button>

      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </li>
  );
}

export function NodeList({ children }: { children: ReactNode }) {
  return <ul className="card overflow-hidden">{children}</ul>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Loading() {
  return <p className="py-8 text-center text-sm text-muted">Cargando…</p>;
}

export function QueryError({ error }: { error: unknown }) {
  return (
    <p className="card border-danger/40 px-4 py-3 text-sm text-danger" role="alert">
      {error instanceof Error ? error.message : 'No se pudo cargar'}
    </p>
  );
}

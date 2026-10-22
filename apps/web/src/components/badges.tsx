import type { NodeType, Priority, StatusRef } from '@backlog/shared';
import { Flag } from 'lucide-react';
import { formatDue } from '../lib/dates';
import { CATEGORY_STYLE, PRIORITY_LABEL, PRIORITY_STYLE, TYPE_LABEL, TYPE_STYLE } from '../lib/labels';

const pill = 'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none';

export function TypeBadge({ type }: { type: NodeType }) {
  return <span className={`${pill} ${TYPE_STYLE[type]}`}>{TYPE_LABEL[type]}</span>;
}

export function StatusPill({ status }: { status: StatusRef }) {
  return <span className={`${pill} ${CATEGORY_STYLE[status.category]}`}>{status.name}</span>;
}

const DUE_STYLE = {
  overdue: 'text-danger',
  today: 'text-warn',
  soon: 'text-fg',
  later: 'text-muted',
} as const;

export function DueChip({ date }: { date: string }) {
  const { text, tone } = formatDue(date);
  return <span className={`shrink-0 text-xs ${DUE_STYLE[tone]}`}>{text}</span>;
}

export function PriorityFlag({ priority, suggested }: { priority: Priority; suggested?: boolean }) {
  if (priority === 'NONE' || priority === 'LOW') return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center ${PRIORITY_STYLE[priority]}`}
      title={`Prioridad ${PRIORITY_LABEL[priority].toLowerCase()}${suggested ? ' (sugerida por IA)' : ''}`}
    >
      <Flag className="size-3.5" aria-hidden />
      <span className="sr-only">Prioridad {PRIORITY_LABEL[priority]}</span>
    </span>
  );
}

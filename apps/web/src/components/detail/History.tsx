import type { ActivityAction, ActivityDTO } from '@backlog/shared';
import { useActivity } from '../../api/hooks';
import { formatDateTime } from '../../lib/dates';

const ACTION_LABEL: Record<ActivityAction, string> = {
  CREATE: 'Creado',
  UPDATE: 'Editado',
  DELETE: 'Enviado a la papelera',
  RESTORE: 'Restaurado',
  PURGE: 'Eliminado definitivamente',
  COMPLETE: 'Completado',
  REOPEN: 'Reabierto',
  LINK: 'Relación agregada',
  UNLINK: 'Relación quitada',
};

const FIELD_LABEL: Record<string, string> = {
  title: 'Título',
  type: 'Tipo',
  body: 'Descripción',
  status: 'Estado',
  priority: 'Prioridad',
  dueDate: 'Fecha límite',
  nextAction: 'Próxima acción',
  outcome: 'Resultado esperado',
  doneCriteria: 'Criterio de terminado',
  url: 'Enlace',
  processed: 'Procesado',
  archivedAt: 'Archivado',
  completedAt: 'Completado',
};

const HIDDEN_FIELDS = new Set(['prioritySource', 'effortSource', 'completedAt', 'slug']);

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

function changes(entry: ActivityDTO): string[] {
  if (entry.action !== 'UPDATE' || !entry.diff?.after) return [];
  return Object.keys(entry.diff.after)
    .filter((k) => !HIDDEN_FIELDS.has(k))
    .map((k) => `${FIELD_LABEL[k] ?? k}: ${show(entry.diff?.before?.[k])} → ${show(entry.diff?.after?.[k])}`);
}

export function History({ nodeId }: { nodeId: string }) {
  const { data } = useActivity(nodeId);
  if (!data) return null;
  return (
    <ol className="space-y-3 border-l border-line pl-4">
      {data.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-line" aria-hidden />
          <p className="text-sm">
            {ACTION_LABEL[a.action]}
            {a.actor === 'AI' && <span className="ml-1 text-xs text-muted">(propuesta de IA aceptada)</span>}
          </p>
          {changes(a).map((c) => (
            <p key={c} className="text-xs text-muted">
              {c}
            </p>
          ))}
          <p className="text-[11px] text-muted">{formatDateTime(a.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}

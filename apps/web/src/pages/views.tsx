import type { NodeType, ViewNodeDTO } from '@backlog/shared';
import { useMemo, useState } from 'react';
import { useBacklogView, useBlockedView, useTodayView, useUpcomingView } from '../api/hooks';
import { EmptyState, Loading, NodeList, NodeRow, PageHeader, QueryError } from '../components/NodeList';
import { QuickCapture } from '../components/QuickCapture';
import { formatDayHeading, localDate } from '../lib/dates';
import { TYPE_LABEL } from '../lib/labels';

export function TodayPage() {
  const { data, isLoading, error } = useTodayView();
  const [showDone, setShowDone] = useState(false);

  return (
    <>
      <PageHeader title="Hoy" subtitle="Vencidas, con fecha de hoy o en curso." />
      <div className="mb-5">
        <QuickCapture type="TASK" extra={{ dueDate: localDate() }} placeholder="Agregar tarea para hoy…" checkDuplicates={false} />
      </div>
      {isLoading && <Loading />}
      {error && <QueryError error={error} />}
      {data && data.items.length === 0 && (
        <EmptyState title="Nada pendiente para hoy" hint="Revisá el backlog o las próximas tareas si querés adelantar algo." />
      )}
      {data && data.items.length > 0 && (
        <NodeList>
          {data.items.map((n) => (
            <NodeRow key={n.id} node={n} showType={false} />
          ))}
        </NodeList>
      )}
      {data && data.completed.length > 0 && (
        <div className="mt-6">
          <button className="text-sm text-muted hover:text-fg" onClick={() => setShowDone(!showDone)}>
            {showDone ? '▾' : '▸'} Completadas hoy ({data.completed.length})
          </button>
          {showDone && (
            <div className="mt-2">
              <NodeList>
                {data.completed.map((n) => (
                  <NodeRow key={n.id} node={n} showType={false} />
                ))}
              </NodeList>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function UpcomingPage() {
  const { data, isLoading, error } = useUpcomingView(14);
  const groups = useMemo(() => {
    const map = new Map<string, ViewNodeDTO[]>();
    for (const n of data?.items ?? []) map.set(n.dueDate!, [...(map.get(n.dueDate!) ?? []), n]);
    return [...map.entries()];
  }, [data]);

  return (
    <>
      <PageHeader title="Próximas" subtitle="Lo que vence en las próximas dos semanas." />
      {isLoading && <Loading />}
      {error && <QueryError error={error} />}
      {data && groups.length === 0 && <EmptyState title="Sin vencimientos próximos" />}
      <div className="space-y-5">
        {groups.map(([date, items]) => (
          <section key={date}>
            <h2 className="mb-2 text-sm font-medium text-muted">{formatDayHeading(date)}</h2>
            <NodeList>
              {items.map((n) => (
                <NodeRow key={n.id} node={n} />
              ))}
            </NodeList>
          </section>
        ))}
      </div>
    </>
  );
}

export function BlockedPage() {
  const { data, isLoading, error } = useBlockedView();
  return (
    <>
      <PageHeader title="Bloqueadas" subtitle="Marcadas como bloqueadas o esperando una dependencia sin terminar." />
      {isLoading && <Loading />}
      {error && <QueryError error={error} />}
      {data && data.items.length === 0 && <EmptyState title="Nada bloqueado" />}
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

const BACKLOG_FILTERS: { label: string; types: NodeType[] | null }[] = [
  { label: 'Todo', types: null },
  { label: 'Ideas', types: ['IDEA'] },
  { label: 'Problemas', types: ['PROBLEM'] },
  { label: 'Tareas', types: ['TASK'] },
  { label: 'Proyectos', types: ['PROJECT'] },
];

export function BacklogPage() {
  const { data, isLoading, error } = useBacklogView();
  const [filter, setFilter] = useState(0);
  const [text, setText] = useState('');

  const types = BACKLOG_FILTERS[filter]!.types;
  const needle = text.trim().toLowerCase();
  const items = (data?.items ?? []).filter(
    (n) => (!types || types.includes(n.type)) && (!needle || n.title.toLowerCase().includes(needle)),
  );

  return (
    <>
      <PageHeader title="Backlog" subtitle="Ideas, problemas y trabajo pendiente sin comprometer.">
        <input className="input w-48" value={text} onChange={(e) => setText(e.target.value)} placeholder="Filtrar…" aria-label="Filtrar backlog" />
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo">
        {BACKLOG_FILTERS.map((f, i) => (
          <button
            key={f.label}
            className={`rounded-full border px-3 py-1 text-xs ${i === filter ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg'}`}
            aria-pressed={i === filter}
            onClick={() => setFilter(i)}
          >
            {f.label}
            {f.types && data && (
              <span className="ml-1 opacity-70">{data.items.filter((n) => f.types!.includes(n.type)).length}</span>
            )}
          </button>
        ))}
      </div>
      {isLoading && <Loading />}
      {error && <QueryError error={error} />}
      {data && items.length === 0 && (
        <EmptyState
          title={types ? `Sin ${TYPE_LABEL[types[0]!].toLowerCase()}s en el backlog` : 'El backlog está vacío'}
          hint="Lo que clasifiques desde la bandeja aparece acá."
        />
      )}
      {items.length > 0 && (
        <NodeList>
          {items.map((n) => (
            <NodeRow key={n.id} node={n} />
          ))}
        </NodeList>
      )}
    </>
  );
}

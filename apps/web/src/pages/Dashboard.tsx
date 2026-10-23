import { Sparkles } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useBlockedView, useMe, useNodes, useRecommend, useTodayView, useTree, useUpcomingView } from '../api/hooks';
import { NodeList, NodeRow } from '../components/NodeList';
import { QuickCapture } from '../components/QuickCapture';
import { buildTree, ProgressBar, progressOf } from '../components/Tree';
import { useSelectedNode } from '../lib/selection';

function Card({ title, to, count, children }: { title: string; to: string; count?: number; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">
          {title}
          {count !== undefined && <span className="ml-1.5 text-muted">{count}</span>}
        </h2>
        <Link to={to} className="text-xs text-muted hover:text-fg">
          Ver todo →
        </Link>
      </div>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="card px-4 py-3 text-sm text-muted">{text}</p>;

/** What to do next: today's first item, or the assistant's pick with its reason. */
function NextUp({ first }: { first: { id: string; title: string; nextAction: string | null } | null }) {
  const recommend = useRecommend();
  const { open } = useSelectedNode();
  const rec = recommend.data;
  const shown = rec ? { id: rec.node.id, title: rec.node.title } : first;

  return (
    <section className="card border-accent/30 p-4" aria-label="Qué hacer ahora">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          {rec ? (rec.byAI ? 'Recomendación del asistente' : 'Recomendación por prioridad y fecha') : 'Para empezar'}
        </p>
        <button className="btn py-1 text-xs" onClick={() => recommend.mutate()} disabled={recommend.isPending}>
          <Sparkles className="size-3.5" aria-hidden />
          {recommend.isPending ? 'Pensando…' : '¿Qué hago ahora?'}
        </button>
      </div>
      {recommend.isSuccess && !rec && <p className="mt-2 text-sm text-muted">No hay tareas pendientes sin bloqueos.</p>}
      {shown && (
        <>
          <button className="mt-1 text-left text-[15px] font-semibold hover:underline" onClick={() => open(shown.id)}>
            {shown.title}
          </button>
          {rec ? (
            <>
              <p className="mt-1 text-sm">{rec.reason}</p>
              <p className="mt-1 text-sm text-muted">Para arrancar: {rec.firstStep}</p>
            </>
          ) : (
            <>
              {first?.nextAction && <p className="mt-1 text-sm text-muted">Siguiente paso: {first.nextAction}</p>}
              <p className="mt-2 text-xs text-muted">La primera de hoy por prioridad y fecha.</p>
            </>
          )}
          <Link to={`/focus/${shown.id}`} className="btn mt-3">
            Entrar en modo foco
          </Link>
        </>
      )}
      {!shown && !recommend.isSuccess && (
        <p className="mt-2 text-sm text-muted">Nada para hoy. Pedile al asistente que elija entre tus pendientes.</p>
      )}
    </section>
  );
}

export function DashboardPage() {
  const { data: me } = useMe();
  const today = useTodayView();
  const upcoming = useUpcomingView(7);
  const blocked = useBlockedView();
  const inbox = useNodes({ processed: false, limit: 1 });
  const tree = useTree();
  const { open } = useSelectedNode();

  const index = useMemo(() => buildTree(tree.data ?? []), [tree.data]);
  const goals = (tree.data ?? []).filter((n) => n.type === 'GOAL' && n.status?.category !== 'DONE');
  const next = today.data?.items[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Hola{me ? `, ${me.name.split(' ')[0]}` : ''}</h1>
        <p className="mt-0.5 text-sm text-muted">
          {inbox.data?.total ? (
            <>
              Tenés <Link to="/inbox" className="font-medium text-accent">{inbox.data.total} en la bandeja</Link> sin clasificar.
            </>
          ) : (
            'Bandeja al día.'
          )}
        </p>
      </div>

      <QuickCapture />

      <NextUp first={next ? { id: next.id, title: next.title, nextAction: next.nextAction } : null} />

      <div className="grid gap-8 lg:grid-cols-2">
        <Card title="Hoy" to="/today" count={today.data?.items.length}>
          {today.data?.items.length ? (
            <NodeList>
              {today.data.items.slice(0, 6).map((n) => (
                <NodeRow key={n.id} node={n} showType={false} />
              ))}
            </NodeList>
          ) : (
            <Empty text="Nada pendiente para hoy." />
          )}
        </Card>

        <Card title="Próximos 7 días" to="/upcoming" count={upcoming.data?.items.length}>
          {upcoming.data?.items.length ? (
            <NodeList>
              {upcoming.data.items.slice(0, 6).map((n) => (
                <NodeRow key={n.id} node={n} showType={false} />
              ))}
            </NodeList>
          ) : (
            <Empty text="Sin vencimientos esta semana." />
          )}
        </Card>

        <Card title="Bloqueadas" to="/blocked" count={blocked.data?.items.length}>
          {blocked.data?.items.length ? (
            <NodeList>
              {blocked.data.items.slice(0, 4).map((n) => (
                <NodeRow key={n.id} node={n} showType={false} />
              ))}
            </NodeList>
          ) : (
            <Empty text="Nada bloqueado." />
          )}
        </Card>

        <Card title="Objetivos activos" to="/goals" count={goals.length}>
          {goals.length ? (
            <ul className="card divide-y divide-line">
              {goals.slice(0, 6).map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-3 py-2.5">
                  <button className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => open(g.id)}>
                    {g.title}
                  </button>
                  <ProgressBar {...progressOf(index, g.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Sin objetivos definidos." />
          )}
        </Card>
      </div>
    </div>
  );
}

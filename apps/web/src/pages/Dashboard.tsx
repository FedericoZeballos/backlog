import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useBlockedView, useMe, useNodes, useTodayView, useTree, useUpcomingView } from '../api/hooks';
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

      {next && (
        <section className="card border-accent/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">Para empezar</p>
          <button className="mt-1 text-left text-[15px] font-semibold hover:underline" onClick={() => open(next.id)}>
            {next.title}
          </button>
          {next.nextAction && <p className="mt-1 text-sm text-muted">Siguiente paso: {next.nextAction}</p>}
          <p className="mt-2 text-xs text-muted">La primera de hoy por prioridad y fecha. La recomendación con IA llega más adelante.</p>
          <Link to={`/focus/${next.id}`} className="btn mt-3">
            Entrar en modo foco
          </Link>
        </section>
      )}

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

import { RELATION_RULES, type RelationDTO, type TreeNodeDTO } from '@backlog/shared';
import { ArrowLeft, CheckCircle2, Circle, Lock } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../api/client';
import { useNode, useTree, useUpdateNode } from '../api/hooks';
import { DueChip, StatusPill, TypeBadge } from '../components/badges';
import { useToast } from '../components/feedback';
import { Loading, QueryError } from '../components/NodeList';
import { useCompletion } from '../lib/completion';
import { TYPE_LABEL } from '../lib/labels';

function ancestors(tree: TreeNodeDTO[] | undefined, id: string): TreeNodeDTO[] {
  const byId = new Map((tree ?? []).map((n) => [n.id, n]));
  const chain: TreeNodeDTO[] = [];
  let current = byId.get(id)?.parentId;
  while (current && byId.has(current) && chain.length < 10) {
    const node = byId.get(current)!;
    chain.push(node);
    current = node.parentId;
  }
  return chain;
}

function Block({ title, children, missing }: { title: string; children?: ReactNode; missing?: string }) {
  // `cond && <x/>` yields false/'' when empty; treat those as missing too.
  const empty = children === undefined || children === null || children === false || children === '';
  return (
    <section>
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {empty ? <p className="text-sm italic text-muted">{missing}</p> : children}
    </section>
  );
}

/**
 * Everything needed to work on one item: goal, reason, definition of done,
 * information, blockers and the next concrete action.
 */
export function FocusPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useNode(id);
  const tree = useTree();
  const navigate = useNavigate();
  const { toggle } = useCompletion();

  if (isLoading) return <Loading />;
  if (error || !data) return <QueryError error={error} />;

  const { node, relations } = data;
  const done = node.status?.category === 'DONE';
  const chain = ancestors(tree.data, node.id);
  const why = chain.find((a) => a.outcome) ?? null;

  const out = (r: RelationDTO) => r.direction === 'out';
  const blockers = relations.filter((r) => r.type === 'DEPENDS_ON' && out(r) && r.node.status?.category !== 'DONE');
  const info = relations.filter((r) => (r.type === 'DOCUMENTS' || r.type === 'INFORMS') && !out(r));
  const subtasks = relations.filter((r) => r.category === 'STRUCTURAL' && out(r));
  const related = relations.filter(
    (r) => r.category === 'CONCEPTUAL' && !info.includes(r),
  );
  const missing = !node.outcome || !node.doneCriteria || !node.nextAction;

  return (
    <div className="mx-auto max-w-2xl">
      <button className="btn btn-ghost -ml-2 mb-4 text-muted" onClick={() => navigate(-1)}>
        <ArrowLeft className="size-4" aria-hidden /> Volver
      </button>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <TypeBadge type={node.type} />
        {chain
          .slice()
          .reverse()
          .map((a) => (
            <span key={a.id}>
              {a.title} ›
            </span>
          ))}
        {node.status && <StatusPill status={node.status} />}
        {node.dueDate && !done && <DueChip date={node.dueDate} />}
      </div>
      <h1 className={`mt-2 text-2xl font-semibold tracking-tight ${done ? 'text-muted line-through' : ''}`}>{node.title}</h1>

      <div className="mt-6 space-y-6">
        <NextAction nodeId={node.id} version={node.version} value={node.nextAction} />

        <Block title="Qué tengo que conseguir" missing="Sin resultado esperado definido.">
          {node.outcome && <p className="text-sm">{node.outcome}</p>}
        </Block>

        <Block title="Por qué importa" missing="No está vinculado a un objetivo o proyecto con un resultado definido.">
          {why && (
            <p className="text-sm">
              Aporta a <strong>{why.title}</strong> ({TYPE_LABEL[why.type].toLowerCase()}): {why.outcome}
            </p>
          )}
        </Block>

        <Block title="Qué significa terminarla" missing="Sin criterio de terminado.">
          {node.doneCriteria && <p className="whitespace-pre-wrap text-sm">{node.doneCriteria}</p>}
        </Block>

        <Block title="Bloqueos" missing="Nada lo bloquea.">
          {blockers.length > 0 && (
            <ul className="space-y-1">
              {blockers.map((b) => (
                <li key={b.id} className="flex items-center gap-2 text-sm text-warn">
                  <Lock className="size-3.5" aria-hidden />
                  <Link to={`/focus/${b.node.id}`} className="hover:underline">
                    {b.node.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Block>

        {subtasks.length > 0 && (
          <Block title="Pasos">
            <ul className="space-y-1.5">
              {subtasks.map((s) => {
                const sDone = s.node.status?.category === 'DONE';
                return (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <button onClick={() => toggle(s.node)} aria-label={sDone ? `Reabrir ${s.node.title}` : `Completar ${s.node.title}`}>
                      {sDone ? <CheckCircle2 className="size-4 text-ok" /> : <Circle className="size-4 text-muted" />}
                    </button>
                    <span className={sDone ? 'text-muted line-through' : ''}>{s.node.title}</span>
                  </li>
                );
              })}
            </ul>
          </Block>
        )}

        <Block title="Información que necesito" missing="No hay notas ni recursos vinculados.">
          {info.length > 0 && <RelationLinks relations={info} />}
        </Block>

        {related.length > 0 && (
          <Block title="Relacionado">
            <RelationLinks relations={related} />
          </Block>
        )}

        {node.body && (
          <Block title="Notas">
            <p className="whitespace-pre-wrap text-sm">{node.body}</p>
          </Block>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-5">
        {node.status && (
          <button className={`btn ${done ? '' : 'btn-primary'}`} onClick={() => toggle(node)}>
            {done ? 'Reabrir' : 'Marcar como terminada'}
          </button>
        )}
        <Link to={`/?node=${node.id}`} className="btn">
          Editar detalles
        </Link>
        {missing && <span className="text-xs text-muted">Completar lo que falta ayuda a arrancar.</span>}
      </div>
    </div>
  );
}

function RelationLinks({ relations }: { relations: RelationDTO[] }) {
  return (
    <ul className="space-y-1">
      {relations.map((r) => (
        <li key={r.id} className="flex items-center gap-2 text-sm">
          <span className="w-32 shrink-0 text-xs text-muted">
            {r.direction === 'out' ? RELATION_RULES[r.type].label : RELATION_RULES[r.type].inverseLabel}
          </span>
          <TypeBadge type={r.node.type} />
          <Link to={`/focus/${r.node.id}`} className="truncate hover:underline">
            {r.node.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NextAction({ nodeId, version, value }: { nodeId: string; version: number; value: string | null }) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const update = useUpdateNode();
  const toast = useToast();
  const changed = text.trim() !== (value ?? '');

  return (
    <section className="card border-accent/30 p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">Siguiente acción concreta</h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!changed) return;
          update.mutate(
            { id: nodeId, version, nextAction: text.trim() || null },
            {
              onSuccess: () => toast({ message: 'Siguiente acción guardada' }),
              onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
            },
          );
        }}
      >
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="¿Qué es lo primero que hacés, en 10–30 minutos?"
          aria-label="Siguiente acción"
        />
        <button className="btn" disabled={!changed || update.isPending}>
          Guardar
        </button>
      </form>
    </section>
  );
}

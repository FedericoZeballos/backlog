import type { GraphIssueDTO, GraphIssueKind, NodeBrief } from '@backlog/shared';
import { X } from 'lucide-react';
import { TypeBadge } from '../components/badges';

const KIND: Record<GraphIssueKind, { title: string; describe: (n: NodeBrief[]) => string }> = {
  DONE_WITH_OPEN_DEPENDENCY: {
    title: 'Terminadas con dependencias abiertas',
    describe: ([a, b]) => `"${a!.title}" está terminada pero depende de "${b!.title}", que sigue abierta.`,
  },
  DONE_PARENT_WITH_OPEN_CHILDREN: {
    title: 'Contenedores terminados con trabajo abierto',
    describe: ([a, b]) => `"${a!.title}" está terminado pero "${b!.title}" no.`,
  },
  DEPENDS_ON_ARCHIVED: {
    title: 'Dependencias de elementos archivados',
    describe: ([a, b]) => `"${a!.title}" depende de "${b!.title}", que está archivado.`,
  },
  POSSIBLE_DUPLICATE: {
    title: 'Posibles duplicados',
    describe: ([a, b]) => `"${a!.title}" y "${b!.title}" se parecen mucho.`,
  },
  ISOLATED: {
    title: 'Sin relaciones',
    describe: () => 'No está conectado con nada.',
  },
};

const ORDER: GraphIssueKind[] = [
  'DONE_WITH_OPEN_DEPENDENCY',
  'DONE_PARENT_WITH_OPEN_CHILDREN',
  'DEPENDS_ON_ARCHIVED',
  'POSSIBLE_DUPLICATE',
  'ISOLATED',
];

export function IssuesPanel({
  issues,
  onSelect,
  onClose,
}: {
  issues: GraphIssueDTO[];
  onSelect: (node: NodeBrief) => void;
  onClose: () => void;
}) {
  return (
    <div className="card absolute left-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-80 flex-col shadow-lg" role="region" aria-label="Problemas del grafo">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-sm font-semibold">Para revisar</h2>
        <button className="btn btn-ghost px-1" onClick={onClose}>
          <X className="size-4" aria-hidden />
          <span className="sr-only">Cerrar</span>
        </button>
      </div>
      <div className="space-y-4 overflow-y-auto p-3">
        {issues.length === 0 && <p className="text-sm text-muted">Todo en orden.</p>}
        {ORDER.map((kind) => {
          const items = issues.filter((i) => i.kind === kind);
          if (!items.length) return null;
          return (
            <section key={kind}>
              <h3 className="label">
                {KIND[kind].title} ({items.length})
              </h3>
              <ul className="space-y-2">
                {items.map((issue, i) => (
                  <li key={`${kind}-${i}`} className="rounded-md bg-subtle px-2 py-1.5 text-xs">
                    {kind !== 'ISOLATED' && <p className="mb-1">{KIND[kind].describe(issue.nodes)}</p>}
                    <div className="flex flex-wrap gap-1">
                      {issue.nodes.map((n) => (
                        <button key={n.id} className="flex items-center gap-1 rounded px-1 hover:bg-surface" onClick={() => onSelect(n)}>
                          <TypeBadge type={n.type} />
                          <span className="max-w-48 truncate">{n.title}</span>
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

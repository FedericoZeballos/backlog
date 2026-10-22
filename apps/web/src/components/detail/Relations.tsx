import { EDGE_TYPES, NODE_TYPES, RELATION_RULES, type EdgeType, type NodeDTO, type NodeType, type RelationDTO } from '@backlog/shared';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { useCreateEdge, useDeleteEdge } from '../../api/hooks';
import { useSelectedNode } from '../../lib/selection';
import { StatusPill, TypeBadge } from '../badges';
import { useToast } from '../feedback';
import { NodePicker } from '../NodePicker';

interface RelationOption {
  key: string;
  type: EdgeType;
  /** 'out': the current node is the source. */
  direction: 'out' | 'in';
  label: string;
  otherTypes: NodeType[];
}

/** Non-structural relations the current node can take part in, in both directions. */
function relationOptions(nodeType: NodeType): RelationOption[] {
  const options: RelationOption[] = [];
  for (const type of EDGE_TYPES) {
    const rule = RELATION_RULES[type];
    if (rule.category === 'STRUCTURAL') continue;
    const targets = rule.allowed[nodeType] ?? [];
    if (targets.length) options.push({ key: `${type}:out`, type, direction: 'out', label: rule.label, otherTypes: [...targets] });
    if (!rule.symmetric) {
      const sources = NODE_TYPES.filter((s) => rule.allowed[s]?.includes(nodeType));
      if (sources.length) options.push({ key: `${type}:in`, type, direction: 'in', label: rule.inverseLabel, otherTypes: sources });
    }
  }
  return options;
}

const labelOf = (r: RelationDTO) => (r.direction === 'out' ? RELATION_RULES[r.type].label : RELATION_RULES[r.type].inverseLabel);

export function Relations({ node, relations }: { node: NodeDTO; relations: RelationDTO[] }) {
  const execution = relations.filter((r) => r.category === 'EXECUTION');
  const conceptual = relations.filter((r) => r.category === 'CONCEPTUAL');
  const options = relationOptions(node.type);
  const [adding, setAdding] = useState(false);
  const [optionKey, setOptionKey] = useState(options[0]?.key ?? '');
  const option = options.find((o) => o.key === optionKey);

  const create = useCreateEdge();
  const remove = useDeleteEdge();
  const toast = useToast();

  function add(otherId: string) {
    if (!option) return;
    const [sourceId, targetId] = option.direction === 'out' ? [node.id, otherId] : [otherId, node.id];
    create.mutate(
      { sourceId, targetId, type: option.type },
      {
        onSuccess: () => {
          setAdding(false);
          toast({ message: 'Relación creada' });
        },
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  }

  return (
    <section className="space-y-5">
      <Group
        title="Dependencias"
        hint="Orden de ejecución: una tarea no puede terminarse antes que aquello de lo que depende."
        relations={execution}
        onRemove={(id) => remove.mutate(id)}
      />
      <Group
        title="Relaciones conceptuales"
        hint="Vínculos de significado; no bloquean la ejecución."
        relations={conceptual}
        onRemove={(id) => remove.mutate(id)}
      />

      {options.length > 0 &&
        (adding ? (
          <div className="space-y-2 rounded-md border border-line p-3">
            <label className="block">
              <span className="label">Este elemento…</span>
              <select className="input" value={optionKey} onChange={(e) => setOptionKey(e.target.value)}>
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                    {RELATION_RULES[o.type].category === 'EXECUTION' ? ' (dependencia)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {option && (
              <NodePicker
                key={option.key}
                types={option.otherTypes}
                excludeIds={[node.id]}
                onPick={(n) => add(n.id)}
                placeholder="Buscar el otro elemento…"
                autoFocus
              />
            )}
            <button className="btn btn-ghost text-xs" onClick={() => setAdding(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button className="btn text-xs" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" aria-hidden /> Agregar relación
          </button>
        ))}
    </section>
  );
}

function Group({
  title,
  hint,
  relations,
  onRemove,
}: {
  title: string;
  hint: string;
  relations: RelationDTO[];
  onRemove: (id: string) => void;
}) {
  const { open } = useSelectedNode();
  return (
    <div>
      <h3 className="label" title={hint}>
        {title}
      </h3>
      {relations.length === 0 ? (
        <p className="text-xs text-muted">Ninguna</p>
      ) : (
        <ul className="space-y-1.5">
          {relations.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 text-xs text-muted">{labelOf(r)}</span>
              <TypeBadge type={r.node.type} />
              <button className="min-w-0 truncate text-left hover:underline" onClick={() => open(r.node.id)}>
                {r.node.title}
              </button>
              {r.node.status && r.category === 'EXECUTION' && <StatusPill status={r.node.status} />}
              <button className="btn btn-ghost ml-auto px-1" onClick={() => onRemove(r.id)} title="Quitar relación">
                <X className="size-3.5" aria-hidden />
                <span className="sr-only">Quitar relación</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import {
  checkRelation,
  NODE_TYPES,
  structuralTypeFor,
  type NodeDTO,
  type NodeType,
  type RelationDTO,
} from '@backlog/shared';
import { ArrowUpRight, FolderInput, X } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { useSetParent } from '../../api/hooks';
import { TYPE_LABEL } from '../../lib/labels';
import { CompleteCheckbox } from '../CompleteCheckbox';
import { useSelectedNode } from '../../lib/selection';
import { StatusPill, TypeBadge } from '../badges';
import { useToast } from '../feedback';
import { NodePicker } from '../NodePicker';
import { QuickCapture } from '../QuickCapture';

const canContain = (parent: NodeType, child: NodeType) =>
  checkRelation(structuralTypeFor(parent, child), parent, child).ok;

/** Parent ("pertenece a") and children (projects, tasks, subtasks) of a node. */
export function Hierarchy({ node, relations }: { node: NodeDTO; relations: RelationDTO[] }) {
  const structural = relations.filter((r) => r.category === 'STRUCTURAL');
  const parent = structural.find((r) => r.direction === 'in');
  const children = structural.filter((r) => r.direction === 'out');

  const parentTypes = NODE_TYPES.filter((p) => canContain(p, node.type));
  const childTypes = NODE_TYPES.filter((c) => canContain(node.type, c));
  const [childType, setChildType] = useState<NodeType>(childTypes.includes('TASK') ? 'TASK' : (childTypes[0] ?? 'TASK'));
  const [moving, setMoving] = useState(false);

  const setParent = useSetParent();
  const toast = useToast();
  const { open } = useSelectedNode();

  function move(parentId: string | null) {
    setParent.mutate(
      { id: node.id, parentId },
      {
        onSuccess: () => {
          setMoving(false);
          toast({ message: parentId ? 'Movido' : 'Quitado de su contenedor' });
        },
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  }

  if (!parentTypes.length && !childTypes.length) return null;

  return (
    <section className="space-y-4">
      {parentTypes.length > 0 && (
        <div>
          <h3 className="label">Pertenece a</h3>
          {moving ? (
            <div className="space-y-2">
              <NodePicker
                types={parentTypes}
                excludeIds={[node.id]}
                onPick={(p) => move(p.id)}
                placeholder={`Buscar ${parentTypes.map((t) => TYPE_LABEL[t].toLowerCase()).join(', ')}…`}
                autoFocus
              />
              <button className="btn btn-ghost text-xs" onClick={() => setMoving(false)}>
                Cancelar
              </button>
            </div>
          ) : parent ? (
            <div className="flex items-center gap-2 text-sm">
              <TypeBadge type={parent.node.type} />
              <button className="truncate hover:underline" onClick={() => open(parent.node.id)}>
                {parent.node.title}
              </button>
              <button className="btn btn-ghost ml-auto px-1.5" onClick={() => setMoving(true)} title="Mover">
                <FolderInput className="size-4" aria-hidden />
                <span className="sr-only">Mover</span>
              </button>
              <button className="btn btn-ghost px-1.5" onClick={() => move(null)} title="Quitar">
                <X className="size-4" aria-hidden />
                <span className="sr-only">Quitar del contenedor</span>
              </button>
            </div>
          ) : (
            <button className="btn text-xs" onClick={() => setMoving(true)}>
              <FolderInput className="size-3.5" aria-hidden /> Asignar a…
            </button>
          )}
        </div>
      )}

      {childTypes.length > 0 && (
        <div>
          <h3 className="label">{node.type === 'TASK' ? 'Subtareas' : 'Contiene'}</h3>
          {children.length > 0 && (
            <ul className="mb-2 space-y-1">
              {children.map((c) => {
                const done = c.node.status?.category === 'DONE';
                return (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    {c.node.type === 'TASK' ? (
                      <CompleteCheckbox node={c.node} />
                    ) : (
                      <TypeBadge type={c.node.type} />
                    )}
                    <button className={`truncate text-left hover:underline ${done ? 'text-muted line-through' : ''}`} onClick={() => open(c.node.id)}>
                      {c.node.title}
                    </button>
                    {c.node.status && c.node.status.category !== 'TODO' && !done && <StatusPill status={c.node.status} />}
                    <ArrowUpRight className="ml-auto size-3.5 text-muted" aria-hidden />
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex gap-2">
            {childTypes.length > 1 && (
              <select
                className="input w-auto"
                value={childType}
                onChange={(e) => setChildType(e.target.value as NodeType)}
                aria-label="Tipo del nuevo elemento"
              >
                {childTypes.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            )}
            <div className="flex-1">
              <QuickCapture
                type={childType}
                extra={{ parentId: node.id }}
                placeholder={node.type === 'TASK' ? 'Agregar subtarea…' : `Agregar ${TYPE_LABEL[childType].toLowerCase()}…`}
                checkDuplicates={false}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

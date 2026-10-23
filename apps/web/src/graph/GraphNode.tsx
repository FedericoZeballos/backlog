import type { GraphNodeDTO } from '@backlog/shared';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Plus } from 'lucide-react';
import { memo } from 'react';
import { DueChip, StatusPill, TypeBadge } from '../components/badges';
import { NODE_HEIGHT, NODE_WIDTH } from './layout';

export interface GraphNodeData extends Record<string, unknown> {
  node: GraphNodeDTO;
  dimmed: boolean;
  isFocus: boolean;
  onExpand?: (id: string) => void;
}

export type FlowNode = Node<GraphNodeData, 'item'>;

const handleClass = '!size-2.5 !border-2 !border-surface !bg-muted opacity-0 transition-opacity group-hover:opacity-100';

function GraphNodeView({ data, selected }: NodeProps<FlowNode>) {
  const { node, dimmed, isFocus, onExpand } = data;
  const done = node.status?.category === 'DONE';

  return (
    <div
      className={`group relative rounded-lg border bg-surface px-3 py-2 shadow-sm transition-opacity ${
        selected ? 'border-accent ring-2 ring-accent/30' : isFocus ? 'border-accent/60' : 'border-line'
      } ${dimmed ? 'opacity-30' : ''}`}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      data-testid="graph-node"
      data-title={node.title}
    >
      <Handle type="target" position={Position.Top} className={handleClass} />
      <div className="flex items-center gap-1.5">
        <TypeBadge type={node.type} />
        {node.status && node.status.category !== 'TODO' && <StatusPill status={node.status} />}
        {node.dueDate && !done && <DueChip date={node.dueDate} />}
      </div>
      <p className={`mt-1 line-clamp-2 text-[13px] leading-snug ${done ? 'text-muted line-through' : ''}`}>{node.title}</p>
      {node.hiddenRelations > 0 && onExpand && (
        <button
          // Top-right corner: away from the connection handles at the top and bottom center.
          className="nodrag absolute -right-2 -top-2 flex items-center gap-0.5 rounded-full border border-line bg-surface px-1.5 text-[11px] text-muted shadow-sm hover:border-accent hover:text-accent"
          onClick={(e) => {
            e.stopPropagation();
            onExpand(node.id);
          }}
          aria-label={
            node.hiddenRelations === 1 ? 'Mostrar 1 relación oculta' : `Mostrar ${node.hiddenRelations} relaciones ocultas`
          }
          title="Expandir: mostrar conexiones fuera de esta vista"
        >
          <Plus className="size-3" aria-hidden />
          {node.hiddenRelations}
        </button>
      )}
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </div>
  );
}

export const GraphNode = memo(GraphNodeView);

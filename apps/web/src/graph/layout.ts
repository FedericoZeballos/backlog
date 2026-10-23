import type { EdgeDTO } from '@backlog/shared';
import ELK from 'elkjs/lib/elk.bundled.js';

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 68;

export type Positions = Record<string, { x: number; y: number }>;

const elk = new ELK();

/** Full automatic layout: hierarchy flows top to bottom, components packed into a block. */
export async function autoLayout(nodeIds: string[], edges: EdgeDTO[]): Promise<Positions> {
  const ids = new Set(nodeIds);
  const result = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '36',
      'elk.layered.spacing.nodeNodeBetweenLayers': '72',
      'elk.spacing.componentComponent': '60',
      'elk.aspectRatio': '1.8',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: nodeIds.map((id) => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: edges
      .filter((e) => ids.has(e.sourceId) && ids.has(e.targetId))
      .map((e) => ({ id: e.id, sources: [e.sourceId], targets: [e.targetId] })),
  });
  return Object.fromEntries((result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
}

/**
 * Places nodes without a saved position next to a positioned neighbour (or below
 * everything), so that what the user arranged by hand never moves.
 */
export function placeMissing(nodeIds: string[], edges: EdgeDTO[], saved: Positions): Positions {
  const result: Positions = { ...saved };
  const missing = nodeIds.filter((id) => !result[id]);
  if (!missing.length) return result;

  const placed = Object.values(result);
  const maxY = placed.length ? Math.max(...placed.map((p) => p.y)) : 0;
  const minX = placed.length ? Math.min(...placed.map((p) => p.x)) : 0;
  const occupied = (x: number, y: number) =>
    Object.values(result).some((p) => Math.abs(p.x - x) < NODE_WIDTH && Math.abs(p.y - y) < NODE_HEIGHT);

  let gridIndex = 0;
  for (const id of missing) {
    const neighbour = edges
      .map((e) => (e.sourceId === id ? e.targetId : e.targetId === id ? e.sourceId : null))
      .find((n): n is string => !!n && !!result[n]);

    let spot: { x: number; y: number } | null = null;
    if (neighbour) {
      const base = result[neighbour]!;
      // Try a ring of slots around the neighbour.
      for (const [dx, dy] of [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [2, 1], [-2, 1]] as const) {
        const x = base.x + dx * (NODE_WIDTH + 30);
        const y = base.y + dy * (NODE_HEIGHT + 50);
        if (!occupied(x, y)) {
          spot = { x, y };
          break;
        }
      }
    }
    if (!spot) {
      const col = gridIndex % 5;
      const row = Math.floor(gridIndex / 5);
      gridIndex++;
      spot = { x: minX + col * (NODE_WIDTH + 30), y: maxY + (placed.length ? NODE_HEIGHT + 80 : 0) + row * (NODE_HEIGHT + 40) };
    }
    result[id] = spot;
  }
  return result;
}

import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * The selected node lives in the URL (`?node=<id>`), so it survives navigation
 * between lists, trees and (later) the graph, and can be shared or bookmarked.
 */
export function useSelectedNode() {
  const [params, setParams] = useSearchParams();
  const id = params.get('node');

  const open = useCallback(
    (nodeId: string) =>
      setParams((p) => {
        p.set('node', nodeId);
        return p;
      }),
    [setParams],
  );
  const close = useCallback(
    () =>
      setParams((p) => {
        p.delete('node');
        return p;
      }),
    [setParams],
  );

  return { id, open, close };
}

import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

export type PanelTab = 'detail' | 'assistant' | 'relations' | 'comments' | 'history';

/** Ask the assistant to start right away when the panel opens (inbox "Procesar con IA", focus "Reducir"). */
export type AssistantStart = 'analyze' | 'reduce';

/**
 * The selected node lives in the URL (`?node=<id>`), so it survives navigation
 * between lists, trees and the graph, and can be shared or bookmarked.
 */
export function useSelectedNode() {
  const [params, setParams] = useSearchParams();
  const id = params.get('node');

  const open = useCallback(
    (nodeId: string, opts: { tab?: PanelTab; start?: AssistantStart } = {}) =>
      setParams((p) => {
        p.set('node', nodeId);
        if (opts.tab) p.set('panel', opts.tab);
        else p.delete('panel');
        if (opts.start) p.set('start', opts.start);
        else p.delete('start');
        return p;
      }),
    [setParams],
  );
  const close = useCallback(
    () =>
      setParams((p) => {
        p.delete('node');
        p.delete('panel');
        p.delete('start');
        return p;
      }),
    [setParams],
  );
  /** Drops the one-shot `start` flag once it has been acted on. */
  const consumeStart = useCallback(
    () =>
      setParams(
        (p) => {
          p.delete('start');
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  return {
    id,
    open,
    close,
    tab: (params.get('panel') as PanelTab | null) ?? null,
    start: (params.get('start') as AssistantStart | null) ?? null,
    consumeStart,
  };
}

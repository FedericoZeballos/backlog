import type { NodeDTO } from '@backlog/shared';
import { useEffect, useState } from 'react';
import { useCompletion } from '../lib/completion';

interface Props {
  node: Pick<NodeDTO, 'id' | 'version' | 'type' | 'status' | 'title'>;
  className?: string;
}

/** Reflects the click immediately and reverts if the server rejects it. */
export function CompleteCheckbox({ node, className = '' }: Props) {
  const { toggle, ready } = useCompletion();
  const done = node.status?.category === 'DONE';
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => setOptimistic(null), [done, node.version]);

  const checked = optimistic ?? done;
  return (
    <input
      type="checkbox"
      className={`size-4 shrink-0 cursor-pointer accent-[var(--color-accent)] ${className}`}
      checked={checked}
      disabled={!ready}
      onChange={() => {
        setOptimistic(!checked);
        toggle(node, () => setOptimistic(null));
      }}
      aria-label={checked ? `Reabrir ${node.title}` : `Completar ${node.title}`}
    />
  );
}

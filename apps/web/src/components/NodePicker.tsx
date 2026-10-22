import type { NodeBrief, NodeType } from '@backlog/shared';
import { useEffect, useState } from 'react';
import { useNodes } from '../api/hooks';
import { TypeBadge } from './badges';

interface Props {
  /** Only these types can be picked. */
  types?: readonly NodeType[];
  excludeIds?: string[];
  onPick: (node: NodeBrief) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/** Search box listing matching nodes; recent ones when empty. */
export function NodePicker({ types, excludeIds = [], onPick, placeholder, autoFocus }: Props) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const disabled = types !== undefined && types.length === 0;
  const { data, isFetching } = useNodes({ q: debounced || undefined, type: types ? [...types] : undefined, limit: 8 }, !disabled);
  const items = (data?.items ?? []).filter((n) => !excludeIds.includes(n.id));

  return (
    <div>
      <input
        className="input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder ?? 'Buscar…'}
        autoFocus={autoFocus}
        aria-label="Buscar elemento"
      />
      <ul className="mt-1 max-h-56 overflow-y-auto rounded-md border border-line bg-surface" role="listbox">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-subtle"
              onClick={() => onPick({ id: n.id, title: n.title, type: n.type })}
            >
              <TypeBadge type={n.type} />
              <span className="truncate">{n.title}</span>
            </button>
          </li>
        ))}
        {!items.length && (
          <li className="px-2.5 py-2 text-xs text-muted">
            {disabled ? 'No hay tipos compatibles' : isFetching ? 'Buscando…' : 'Sin resultados'}
          </li>
        )}
      </ul>
    </div>
  );
}

import type { CreateNodeInput, NodeType } from '@backlog/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '../api/client';
import { useCreateNode, useSimilar } from '../api/hooks';
import { useSelectedNode } from '../lib/selection';
import { TypeBadge } from './badges';
import { useToast } from './feedback';

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

interface Props {
  /** Defaults to an unclassified inbox item. */
  type?: NodeType;
  extra?: Partial<CreateNodeInput>;
  placeholder?: string;
  autoFocus?: boolean;
  onCreated?: () => void;
  /** Hide the duplicate hint (e.g. adding subtasks inline). */
  checkDuplicates?: boolean;
}

/** One line, Enter to save. Warns about possible duplicates while typing. */
export function QuickCapture({ type, extra, placeholder, autoFocus, onCreated, checkDuplicates = true }: Props) {
  const [title, setTitle] = useState('');
  const create = useCreateNode();
  const toast = useToast();
  const { open } = useSelectedNode();
  const debounced = useDebounced(title, 350);
  const similar = useSimilar(checkDuplicates ? debounced : '');

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value || create.isPending) return;
    create.mutate(
      { title: value, ...(type && { type }), ...extra },
      {
        onSuccess: () => {
          setTitle('');
          onCreated?.();
        },
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  }

  const matches = title.trim().length >= 3 ? (similar.data ?? []) : [];

  return (
    <form onSubmit={submit}>
      <input
        className="input py-2 text-[15px]"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder ?? 'Anotá lo que tengas en la cabeza y apretá Enter…'}
        autoFocus={autoFocus}
        maxLength={300}
        aria-label="Captura rápida"
      />
      {matches.length > 0 && (
        <div className="mt-2 rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs">
          <p className="font-medium text-warn">Puede que ya lo tengas anotado:</p>
          <ul className="mt-1 space-y-1">
            {matches.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <TypeBadge type={m.type} />
                <button type="button" className="truncate text-left hover:underline" onClick={() => open(m.id)}>
                  {m.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}

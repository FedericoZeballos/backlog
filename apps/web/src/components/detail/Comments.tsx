import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../api/client';
import { useAddComment, useComments, useDeleteComment } from '../../api/hooks';
import { timeAgo } from '../../lib/dates';
import { useConfirm, useToast } from '../feedback';

export function Comments({ nodeId }: { nodeId: string }) {
  const { data: comments } = useComments(nodeId);
  const add = useAddComment(nodeId);
  const remove = useDeleteComment(nodeId);
  const [body, setBody] = useState('');
  const toast = useToast();
  const confirm = useConfirm();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    add.mutate(body.trim(), {
      onSuccess: () => setBody(''),
      onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
    });
  }

  return (
    <section className="space-y-3">
      {comments?.length === 0 && <p className="text-xs text-muted">Sin comentarios todavía.</p>}
      <ul className="space-y-3">
        {comments?.map((c) => (
          <li key={c.id} className="group rounded-md bg-subtle px-3 py-2">
            <p className="whitespace-pre-wrap text-sm">{c.body}</p>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
              <span>{timeAgo(c.createdAt)}</span>
              <button
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={async () => {
                  if (await confirm({ title: '¿Borrar el comentario?', confirmLabel: 'Borrar', danger: true })) remove.mutate(c.id);
                }}
                title="Borrar comentario"
              >
                <Trash2 className="size-3.5" aria-hidden />
                <span className="sr-only">Borrar comentario</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="space-y-2">
        <textarea
          className="input"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Agregar un comentario…"
          aria-label="Nuevo comentario"
        />
        <div className="flex justify-end">
          <button className="btn" disabled={!body.trim() || add.isPending}>
            Comentar
          </button>
        </div>
      </form>
    </section>
  );
}

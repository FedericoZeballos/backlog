import { isActionable, type NodeDTO } from '@backlog/shared';
import { useStatuses, useUpdateNode } from '../api/hooks';
import { errorMessage } from '../api/client';
import { useToast } from '../components/feedback';

/** Toggles a task between its first "done" status and the default status. */
export function useCompletion() {
  const { data: statuses } = useStatuses();
  const update = useUpdateNode();
  const toast = useToast();

  const done = statuses?.find((s) => s.category === 'DONE');
  const reopen = statuses?.find((s) => s.isDefault) ?? statuses?.find((s) => s.category === 'TODO');

  function toggle(node: Pick<NodeDTO, 'id' | 'version' | 'type' | 'status'>, onError?: () => void) {
    if (!isActionable(node.type) || !done || !reopen) return;
    const isDone = node.status?.category === 'DONE';
    update.mutate(
      { id: node.id, version: node.version, statusId: isDone ? reopen.id : done.id },
      {
        onSuccess: () => toast({ message: isDone ? 'Reabierta' : 'Completada' }),
        onError: (err) => {
          onError?.();
          toast({ message: errorMessage(err), tone: 'error' });
        },
      },
    );
  }

  return { toggle, ready: !!done && !!reopen };
}

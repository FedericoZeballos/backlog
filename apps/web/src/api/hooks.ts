import type {
  ActivityDTO,
  CommentDTO,
  CreateEdgeInput,
  CreateNodeInput,
  InvitationDTO,
  NodeDetailDTO,
  NodeDTO,
  NodeType,
  SimilarNodeDTO,
  StatusCategory,
  StatusDTO,
  TreeNodeDTO,
  UpdateNodeInput,
  UserDTO,
  UserRole,
  ViewNodeDTO,
} from '@backlog/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { localDate, localMidnightISO } from '../lib/dates';
import { api, ApiError } from './client';

// ---------- Cache invalidation ----------

/** Anything that changes nodes or relations can affect every list, view and tree. */
const GRAPH_KEYS = new Set(['nodes', 'view', 'tree', 'node', 'activity', 'similar']);

export function invalidateGraph(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => GRAPH_KEYS.has(q.queryKey[0] as string) });
}

function useGraphMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => invalidateGraph(qc) });
}

// ---------- Auth ----------

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api<{ user: UserDTO }>('/auth/me')).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api<{ user: UserDTO }>('/auth/login', { method: 'POST', body }),
    onSuccess: ({ user }) => {
      qc.clear();
      qc.setQueryData(['me'], user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { token: string; email: string; name: string; password: string }) =>
      api<{ user: UserDTO }>('/auth/register', { method: 'POST', body }),
    onSuccess: ({ user }) => {
      qc.clear();
      qc.setQueryData(['me'], user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  });
}

export function useInvitationCheck(token: string) {
  return useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api<{ email: string | null; expiresAt: string }>(`/auth/invitations/${token}`),
    retry: false,
  });
}

// ---------- Nodes ----------

export interface NodeListParams {
  type?: NodeType[];
  processed?: boolean;
  deleted?: boolean;
  archived?: 'exclude' | 'include' | 'only';
  q?: string;
  limit?: number;
}

export function useNodes(params: NodeListParams, enabled = true) {
  return useQuery({
    queryKey: ['nodes', params],
    queryFn: () =>
      api<{ items: NodeDTO[]; total: number }>('/nodes', {
        query: { ...params, type: params.type?.join(',') },
      }),
    enabled,
  });
}

export function useNode(id: string | null) {
  return useQuery({
    queryKey: ['node', id],
    queryFn: () => api<NodeDetailDTO>(`/nodes/${id}`),
    enabled: !!id,
  });
}

export function useSimilar(title: string, excludeId?: string) {
  const trimmed = title.trim();
  return useQuery({
    queryKey: ['similar', trimmed, excludeId],
    queryFn: async () =>
      (await api<{ items: SimilarNodeDTO[] }>('/nodes/similar', { query: { title: trimmed, excludeId } })).items,
    enabled: trimmed.length >= 3,
    staleTime: 30_000,
  });
}

export const useCreateNode = () =>
  useGraphMutation((body: Partial<CreateNodeInput> & { title: string }) =>
    api<{ node: NodeDTO }>('/nodes', { method: 'POST', body }).then((r) => r.node),
  );

export const useUpdateNode = () =>
  useGraphMutation(({ id, ...body }: UpdateNodeInput & { id: string }) =>
    api<{ node: NodeDTO }>(`/nodes/${id}`, { method: 'PATCH', body }).then((r) => r.node),
  );

export const useDeleteNode = () => useGraphMutation((id: string) => api<void>(`/nodes/${id}`, { method: 'DELETE' }));

export const useRestoreNode = () =>
  useGraphMutation((id: string) =>
    api<{ node: NodeDTO; droppedRelations: { id: string; type: string; reason: string }[] }>(`/nodes/${id}/restore`, {
      method: 'POST',
    }),
  );

export const usePurgeNode = () => useGraphMutation((id: string) => api<void>(`/nodes/${id}/purge`, { method: 'DELETE' }));

export const useSetParent = () =>
  useGraphMutation(({ id, parentId }: { id: string; parentId: string | null }) =>
    api<void>(`/nodes/${id}/parent`, { method: 'PUT', body: { parentId } }),
  );

export const useCreateEdge = () =>
  useGraphMutation((body: CreateEdgeInput) => api<{ edge: { id: string } }>('/edges', { method: 'POST', body }));

export const useDeleteEdge = () => useGraphMutation((id: string) => api<void>(`/edges/${id}`, { method: 'DELETE' }));

export function useActivity(id: string) {
  return useQuery({
    queryKey: ['activity', id],
    queryFn: async () => (await api<{ items: ActivityDTO[] }>(`/nodes/${id}/activity`)).items,
  });
}

// ---------- Comments ----------

export function useComments(nodeId: string) {
  return useQuery({
    queryKey: ['comments', nodeId],
    queryFn: async () => (await api<{ items: CommentDTO[] }>(`/nodes/${nodeId}/comments`)).items,
  });
}

export function useAddComment(nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api(`/nodes/${nodeId}/comments`, { method: 'POST', body: { body } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['comments', nodeId] }),
  });
}

export function useDeleteComment(nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/comments/${id}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['comments', nodeId] }),
  });
}

// ---------- Views ----------

export function useTodayView() {
  const date = localDate();
  return useQuery({
    queryKey: ['view', 'today', date],
    queryFn: () =>
      api<{ items: ViewNodeDTO[]; completed: ViewNodeDTO[] }>('/views/today', {
        query: { date, since: localMidnightISO() },
      }),
  });
}

export function useUpcomingView(days = 14) {
  const date = localDate();
  return useQuery({
    queryKey: ['view', 'upcoming', date, days],
    queryFn: () => api<{ items: ViewNodeDTO[] }>('/views/upcoming', { query: { date, days } }),
  });
}

export function useBlockedView() {
  return useQuery({
    queryKey: ['view', 'blocked'],
    queryFn: () => api<{ items: ViewNodeDTO[] }>('/views/blocked'),
  });
}

export function useBacklogView() {
  return useQuery({
    queryKey: ['view', 'backlog'],
    queryFn: () => api<{ items: ViewNodeDTO[] }>('/views/backlog'),
  });
}

export function useTree() {
  return useQuery({
    queryKey: ['tree'],
    queryFn: async () => (await api<{ items: TreeNodeDTO[] }>('/tree')).items,
  });
}

// ---------- Statuses ----------

export function useStatuses() {
  return useQuery({
    queryKey: ['statuses'],
    queryFn: async () => (await api<{ items: StatusDTO[] }>('/statuses')).items,
    staleTime: 60_000,
  });
}

function useStatusMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ['statuses'] });
      await invalidateGraph(qc);
    },
  });
}

export const useCreateStatus = () =>
  useStatusMutation((body: { name: string; category: StatusCategory }) => api('/statuses', { method: 'POST', body }));

export const useUpdateStatus = () =>
  useStatusMutation(({ id, ...body }: { id: string; name?: string; category?: StatusCategory; isDefault?: true }) =>
    api(`/statuses/${id}`, { method: 'PATCH', body }),
  );

export const useDeleteStatus = () =>
  useStatusMutation(({ id, moveTo }: { id: string; moveTo?: string }) =>
    api(`/statuses/${id}`, { method: 'DELETE', query: { moveTo } }),
  );

export const useReorderStatuses = () =>
  useStatusMutation((ids: string[]) => api('/statuses/order', { method: 'PUT', body: { ids } }));

// ---------- Admin ----------

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await api<{ items: UserDTO[] }>('/admin/users')).items,
  });
}

export function useInvitations() {
  return useQuery({
    queryKey: ['admin', 'invitations'],
    queryFn: async () => (await api<{ items: InvitationDTO[] }>('/admin/invitations')).items,
  });
}

function useAdminMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }) });
}

export const useCreateInvitation = () =>
  useAdminMutation((body: { email?: string; role: UserRole; expiresInDays: number }) =>
    api<{ invitation: InvitationDTO; token: string; url: string }>('/admin/invitations', { method: 'POST', body }),
  );

export const useRevokeInvitation = () =>
  useAdminMutation((id: string) => api(`/admin/invitations/${id}/revoke`, { method: 'POST' }));

export const useSetUserDisabled = () =>
  useAdminMutation(({ id, disabled }: { id: string; disabled: boolean }) =>
    api(`/admin/users/${id}/${disabled ? 'disable' : 'enable'}`, { method: 'POST' }),
  );

import type { InvitationDTO, UserRole } from '@backlog/shared';
import { Copy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { errorMessage } from '../api/client';
import { useAdminUsers, useCreateInvitation, useInvitations, useMe, useRevokeInvitation, useSetUserDisabled } from '../api/hooks';
import { useConfirm, useToast } from '../components/feedback';
import { PageHeader } from '../components/NodeList';
import { formatDateTime } from '../lib/dates';

function invitationState(inv: InvitationDTO): { text: string; tone: string } {
  if (inv.usedAt) return { text: `Usada por ${inv.usedBy?.email ?? '—'}`, tone: 'text-ok' };
  if (inv.revokedAt) return { text: 'Revocada', tone: 'text-muted' };
  if (new Date(inv.expiresAt) < new Date()) return { text: 'Vencida', tone: 'text-muted' };
  return { text: `Pendiente, vence ${formatDateTime(inv.expiresAt)}`, tone: 'text-warn' };
}

export function AdminPage() {
  const { data: me } = useMe();
  if (me && me.role !== 'ADMIN') return <Navigate to="/" replace />;
  return (
    <>
      <PageHeader title="Administración" subtitle="Invitaciones y cuentas. No da acceso a los datos de otros usuarios." />
      <Invitations />
      <Users />
    </>
  );
}

function Invitations() {
  const { data } = useInvitations();
  const create = useCreateInvitation();
  const revoke = useRevokeInvitation();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('USER');
  const [days, setDays] = useState(7);
  const [link, setLink] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      { email: email.trim() || undefined, role, expiresInDays: days },
      {
        onSuccess: (r) => {
          setLink(r.url);
          setEmail('');
        },
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  }

  return (
    <section>
      <h2 className="text-base font-semibold">Invitar</h2>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block min-w-56 flex-1">
          <span className="label">Email (opcional: la limita a esa dirección)</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@ejemplo.com" />
        </label>
        <label className="block">
          <span className="label">Rol</span>
          <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="USER">Usuario</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Vence en (días)</span>
          <input className="input w-20" type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </label>
        <button className="btn btn-primary" disabled={create.isPending}>
          Generar link
        </button>
      </form>

      {link && (
        <div className="card mt-3 border-accent/30 p-3">
          <p className="text-sm font-medium">Link de invitación (se muestra una sola vez)</p>
          <div className="mt-2 flex gap-2">
            <input className="input font-mono text-xs" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Link de invitación" />
            <button
              className="btn"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                toast({ message: 'Link copiado' });
              }}
            >
              <Copy className="size-4" aria-hidden /> Copiar
            </button>
          </div>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="card mt-4 divide-y divide-line">
          {data.map((inv) => {
            const state = invitationState(inv);
            const pending = !inv.usedAt && !inv.revokedAt && new Date(inv.expiresAt) > new Date();
            return (
              <li key={inv.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{inv.email ?? 'Cualquier email'}</span>
                <span className="text-xs text-muted">{inv.role === 'ADMIN' ? 'Admin' : 'Usuario'}</span>
                <span className={`text-xs ${state.tone}`}>{state.text}</span>
                {pending && (
                  <button className="btn btn-danger px-2 py-1 text-xs" onClick={() => revoke.mutate(inv.id)}>
                    Revocar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Users() {
  const { data: users } = useAdminUsers();
  const { data: me } = useMe();
  const setDisabled = useSetUserDisabled();
  const confirm = useConfirm();
  const toast = useToast();

  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold">Usuarios</h2>
      <ul className="card mt-3 divide-y divide-line">
        {users?.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{u.name}</span> <span className="text-muted">{u.email}</span>
            </span>
            <span className="text-xs text-muted">{u.role === 'ADMIN' ? 'Admin' : 'Usuario'}</span>
            {u.disabledAt && <span className="text-xs text-danger">Desactivado</span>}
            {u.id !== me?.id && (
              <button
                className={`btn px-2 py-1 text-xs ${u.disabledAt ? '' : 'btn-danger'}`}
                onClick={async () => {
                  const disabling = !u.disabledAt;
                  if (
                    disabling &&
                    !(await confirm({
                      title: `¿Desactivar a ${u.name}?`,
                      message: 'Se cierran sus sesiones y no puede volver a entrar hasta que lo reactives. Sus datos se conservan.',
                      confirmLabel: 'Desactivar',
                      danger: true,
                    }))
                  )
                    return;
                  setDisabled.mutate(
                    { id: u.id, disabled: disabling },
                    { onError: (err) => toast({ message: errorMessage(err), tone: 'error' }) },
                  );
                }}
              >
                {u.disabledAt ? 'Reactivar' : 'Desactivar'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

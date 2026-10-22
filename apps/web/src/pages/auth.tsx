import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../api/client';
import { useInvitationCheck, useLogin, useMe, useRegister } from '../api/hooks';

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6 shadow-sm">
        <p className="text-sm font-semibold tracking-tight text-accent">Backlog</p>
        <h1 className="mt-2 text-lg font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="text-sm text-danger" role="alert">
      {errorMessage(error)}
    </p>
  );
}

export function LoginPage() {
  const { data: me } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (me) return <Navigate to="/" replace />;

  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate('/', { replace: true }) });
  }

  return (
    <AuthCard title="Iniciar sesión">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="label">Email</span>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="block">
          <span className="label">Contraseña</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <FormError error={login.error} />
        <button className="btn btn-primary w-full" disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="text-center text-xs text-muted">El acceso es por invitación.</p>
      </form>
    </AuthCard>
  );
}

export function InvitePage() {
  const { token = '' } = useParams();
  const check = useInvitationCheck(token);
  const register = useRegister();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', name: '', password: '', confirm: '' });
  const [mismatch, setMismatch] = useState(false);

  if (check.isLoading) return <AuthCard title="Verificando invitación…">{null}</AuthCard>;
  if (check.error) {
    return (
      <AuthCard title="Invitación no válida" subtitle={errorMessage(check.error)}>
        <a className="btn w-full" href="/login">
          Ir al inicio de sesión
        </a>
      </AuthCard>
    );
  }

  const fixedEmail = check.data?.email ?? null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) return setMismatch(true);
    setMismatch(false);
    register.mutate(
      { token, email: fixedEmail ?? form.email, name: form.name, password: form.password },
      { onSuccess: () => navigate('/', { replace: true }) },
    );
  }

  return (
    <AuthCard title="Crear tu cuenta" subtitle="Te invitaron a usar Backlog.">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="label">Email</span>
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={fixedEmail ?? form.email}
            disabled={!!fixedEmail}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </label>
        <label className="block">
          <span className="label">Nombre</span>
          <input className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label className="block">
          <span className="label">Contraseña (mínimo 10 caracteres)</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </label>
        <label className="block">
          <span className="label">Repetir contraseña</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            required
          />
        </label>
        {mismatch && <p className="text-sm text-danger">Las contraseñas no coinciden</p>}
        <FormError error={register.error} />
        <button className="btn btn-primary w-full" disabled={register.isPending}>
          {register.isPending ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
    </AuthCard>
  );
}

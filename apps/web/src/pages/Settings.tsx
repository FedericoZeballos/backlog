import { STATUS_CATEGORIES, type AIProviderName, type StatusCategory, type StatusDTO } from '@backlog/shared';
import { ArrowDown, ArrowUp, Star, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../api/client';
import {
  useAIStatus,
  useCreateStatus,
  useDeleteStatus,
  useReorderStatuses,
  useSaveAISettings,
  useStatuses,
  useUpdateStatus,
} from '../api/hooks';
import { Modal, useToast } from '../components/feedback';
import { Loading, PageHeader } from '../components/NodeList';
import { CATEGORY_LABEL } from '../lib/labels';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Configuración" />
      <AISettingsSection />
      <div className="mt-10">
        <StatusesSettings />
      </div>
      <section className="mt-10">
        <h2 className="text-base font-semibold">Obsidian</h2>
        <p className="mt-1 text-sm text-muted">La exportación a Obsidian se configura acá cuando esté disponible.</p>
      </section>
    </>
  );
}

const PROVIDERS: { id: AIProviderName; label: string; hint: string }[] = [
  { id: 'OLLAMA', label: 'Ollama (local)', hint: 'Gratis y privado: corre en tu computadora. Más lento.' },
  { id: 'ANTHROPIC', label: 'Claude (Anthropic)', hint: 'Más rápido y preciso. Pago por uso; requiere clave en el servidor.' },
  { id: 'FAKE', label: 'Modo de prueba', hint: 'Respuestas fijas, sin IA real. Útil para probar el flujo.' },
];

function AISettingsSection() {
  const { data: status, isLoading, refetch, isFetching } = useAIStatus();
  const save = useSaveAISettings();
  const toast = useToast();
  const [provider, setProvider] = useState<AIProviderName | null>(null);
  const [model, setModel] = useState('');

  useEffect(() => {
    if (status && provider === null) {
      setProvider(status.provider);
      setModel(status.model);
    }
  }, [status, provider]);

  if (isLoading || !status || !provider) return <Loading />;
  const dirty = provider !== status.provider || model.trim() !== status.model;
  const ollamaModels = status.installedModels;

  function choose(p: AIProviderName) {
    setProvider(p);
    if (p === 'FAKE') setModel('modo-de-prueba');
    else if (p === 'ANTHROPIC') setModel('claude-opus-5-5');
    else setModel(ollamaModels.includes('qwen2.5:7b') ? 'qwen2.5:7b' : (ollamaModels[0] ?? 'qwen2.5:7b'));
  }

  return (
    <section aria-labelledby="ai-title">
      <h2 id="ai-title" className="text-base font-semibold">
        Asistente de IA
      </h2>
      <p className={`mt-1 flex items-center gap-1.5 text-sm ${status.available ? 'text-ok' : 'text-warn'}`} role="status">
        <span className={`size-2 rounded-full ${status.available ? 'bg-ok' : 'bg-warn'}`} aria-hidden />
        {status.detail}
        <button className="ml-1 text-xs text-muted underline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'verificando…' : 'verificar'}
        </button>
      </p>

      <fieldset className="mt-3 space-y-2">
        <legend className="sr-only">Proveedor</legend>
        {PROVIDERS.map((p) => (
          <label key={p.id} className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${provider === p.id ? 'border-accent bg-accent/5' : 'border-line'}`}>
            <input type="radio" name="provider" className="mt-1 accent-[var(--color-accent)]" checked={provider === p.id} onChange={() => choose(p.id)} />
            <span>
              <span className="text-sm font-medium">{p.label}</span>
              <span className="block text-xs text-muted">{p.hint}</span>
              {p.id === 'ANTHROPIC' && !status.anthropicConfigured && (
                <span className="block text-xs text-warn">Falta ANTHROPIC_API_KEY en apps/api/.env</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>

      {provider !== 'FAKE' && (
        <label className="mt-3 block max-w-sm">
          <span className="label">Modelo</span>
          {provider === 'OLLAMA' && ollamaModels.length > 0 ? (
            <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
              {!ollamaModels.includes(model) && <option value={model}>{model} (no instalado)</option>}
              {ollamaModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
          )}
          {provider === 'OLLAMA' && (
            <span className="mt-1 block text-xs text-muted">
              Con 4 GB de video: qwen2.5:7b responde mejor pero tarda 2–4 minutos; qwen2.5:3b tarda menos de un minuto.
            </span>
          )}
        </label>
      )}

      <button
        className="btn btn-primary mt-3"
        disabled={!dirty || !model.trim() || save.isPending}
        onClick={() =>
          save.mutate(
            { provider, model: model.trim() },
            {
              onSuccess: () => toast({ message: 'Asistente configurado' }),
              onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
            },
          )
        }
      >
        Guardar
      </button>
    </section>
  );
}

function StatusesSettings() {
  const { data: statuses, isLoading } = useStatuses();
  const reorder = useReorderStatuses();
  const create = useCreateStatus();
  const toast = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<StatusCategory>('IN_PROGRESS');
  const [deleting, setDeleting] = useState<StatusDTO | null>(null);

  const onError = (err: unknown) => toast({ message: errorMessage(err), tone: 'error' });

  function move(index: number, delta: number) {
    if (!statuses) return;
    const ids = statuses.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    reorder.mutate(ids, { onError });
  }

  function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), category }, { onSuccess: () => setName(''), onError });
  }

  return (
    <section>
      <h2 className="text-base font-semibold">Estados de las tareas</h2>
      <p className="mt-1 text-sm text-muted">
        La categoría define cómo se comporta cada estado: "Terminada" marca la tarea como completada y "Bloqueada" la muestra en
        Bloqueadas.
      </p>
      {isLoading && <Loading />}
      <ul className="card mt-3 divide-y divide-line">
        {statuses?.map((s, i) => (
          <StatusRow
            key={s.id}
            status={s}
            first={i === 0}
            last={i === statuses.length - 1}
            onMove={(d) => move(i, d)}
            onDelete={() => setDeleting(s)}
          />
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex flex-wrap gap-2">
        <input className="input max-w-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuevo estado…" aria-label="Nombre del estado" />
        <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value as StatusCategory)} aria-label="Categoría">
          {STATUS_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <button className="btn" disabled={!name.trim()}>
          Agregar
        </button>
      </form>
      {deleting && statuses && <DeleteStatusDialog status={deleting} others={statuses.filter((s) => s.id !== deleting.id)} onClose={() => setDeleting(null)} />}
    </section>
  );
}

function StatusRow({
  status,
  first,
  last,
  onMove,
  onDelete,
}: {
  status: StatusDTO;
  first: boolean;
  last: boolean;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const update = useUpdateStatus();
  const toast = useToast();
  const [name, setName] = useState(status.name);
  useEffect(() => setName(status.name), [status.name]);
  const onError = (err: unknown) => toast({ message: errorMessage(err), tone: 'error' });

  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <input
        className="input max-w-[12rem] py-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== status.name && update.mutate({ id: status.id, name: name.trim() }, { onError })}
        aria-label="Nombre"
      />
      <select
        className="input w-auto py-1"
        value={status.category}
        onChange={(e) => update.mutate({ id: status.id, category: e.target.value as StatusCategory }, { onError })}
        aria-label="Categoría"
      >
        {STATUS_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </select>
      <button
        className={`btn btn-ghost px-1.5 ${status.isDefault ? 'text-warn' : 'text-muted'}`}
        title={status.isDefault ? 'Estado por defecto' : 'Usar como estado por defecto'}
        onClick={() => !status.isDefault && update.mutate({ id: status.id, isDefault: true }, { onError })}
      >
        <Star className="size-4" fill={status.isDefault ? 'currentColor' : 'none'} aria-hidden />
        <span className="sr-only">Por defecto</span>
      </button>
      <span className="ml-auto flex gap-1">
        <button className="btn btn-ghost px-1.5" disabled={first} onClick={() => onMove(-1)} title="Subir">
          <ArrowUp className="size-4" aria-hidden />
          <span className="sr-only">Subir</span>
        </button>
        <button className="btn btn-ghost px-1.5" disabled={last} onClick={() => onMove(1)} title="Bajar">
          <ArrowDown className="size-4" aria-hidden />
          <span className="sr-only">Bajar</span>
        </button>
        <button className="btn btn-ghost px-1.5 text-danger" disabled={status.isDefault} onClick={onDelete} title="Borrar">
          <Trash2 className="size-4" aria-hidden />
          <span className="sr-only">Borrar</span>
        </button>
      </span>
    </li>
  );
}

function DeleteStatusDialog({ status, others, onClose }: { status: StatusDTO; others: StatusDTO[]; onClose: () => void }) {
  const del = useDeleteStatus();
  const [inUse, setInUse] = useState<number | null>(null);
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '');
  const toast = useToast();

  function submit(withMove: boolean) {
    del.mutate(
      { id: status.id, moveTo: withMove ? moveTo : undefined },
      {
        onSuccess: () => {
          toast({ message: 'Estado borrado' });
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'STATUS_IN_USE') setInUse((err.details as { count: number }).count);
          else toast({ message: errorMessage(err), tone: 'error' });
        },
      },
    );
  }

  return (
    <Modal onClose={onClose} labelledBy="del-status">
      <h2 id="del-status" className="text-base font-semibold">
        Borrar “{status.name}”
      </h2>
      {inUse === null ? (
        <>
          <p className="mt-2 text-sm text-muted">Si hay tareas con este estado, te vamos a pedir a cuál moverlas.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-danger" onClick={() => submit(false)}>
              Borrar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm">
            {inUse} {inUse === 1 ? 'elemento usa' : 'elementos usan'} este estado. ¿A cuál los movemos?
          </p>
          <select className="input mt-3" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Mover a">
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-danger" disabled={!moveTo} onClick={() => submit(true)}>
              Mover y borrar
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

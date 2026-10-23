import type { AIMessageDTO, AIProposalDTO, NodeDTO } from '@backlog/shared';
import { Bot, ListChecks, Scissors, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../api/client';
import { useAIStatus, useAITurn, useConversation, usePropose } from '../../api/hooks';
import { useSelectedNode } from '../../lib/selection';
import { ProposalReview } from './ProposalReview';

function useElapsed(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return setSeconds(0);
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);
  return seconds;
}

const duration = (ms: number | null) => (ms ? (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`) : '');

export function Assistant({ node }: { node: NodeDTO }) {
  const { data: conversation, isLoading } = useConversation(node.id);
  const status = useAIStatus();
  const turn = useAITurn(node.id);
  const propose = usePropose(node.id);
  const { start, consumeStart } = useSelectedNode();
  const [draft, setDraft] = useState('');
  const [lastAction, setLastAction] = useState<'turn' | 'plan' | 'reduce'>('turn');
  const bottom = useRef<HTMLDivElement>(null);

  const running = turn.isPending || propose.isPending;
  const elapsed = useElapsed(running);
  const error = turn.error ?? propose.error;

  // One-shot start from the inbox ("Procesar con IA") or focus mode ("Reducir").
  useEffect(() => {
    if (!start || isLoading || running) return;
    consumeStart();
    if (start === 'reduce') runPropose('reduce');
    else if (!conversation?.messages.length) runTurn();
    // Runs once per start flag; the runners are recreated every render.
  }, [start, isLoading]);

  // Block body on purpose: newer browsers return a Promise from scrollIntoView, and
  // React would take a returned Promise for a cleanup function.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [conversation?.messages.length, conversation?.proposals.length, running]);

  function runTurn(message?: string) {
    setLastAction('turn');
    propose.reset();
    turn.mutate(message, { onSuccess: () => setDraft('') });
  }
  function runPropose(mode: 'plan' | 'reduce') {
    setLastAction(mode);
    turn.reset();
    propose.mutate(mode);
  }
  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (draft.trim() && !running) runTurn(draft.trim());
  }

  const items: ({ kind: 'message'; at: string; m: AIMessageDTO } | { kind: 'proposal'; at: string; p: AIProposalDTO })[] = [
    ...(conversation?.messages ?? []).map((m) => ({ kind: 'message' as const, at: m.createdAt, m })),
    ...(conversation?.proposals ?? []).map((p) => ({ kind: 'proposal' as const, at: p.createdAt, p })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const lastAssistant = [...(conversation?.messages ?? [])].reverse().find((m) => m.role === 'ASSISTANT');
  const ready = lastAssistant?.structured?.enoughInfo ?? false;
  const unavailable = status.data && !status.data.available;

  return (
    <section className="flex min-h-full flex-col gap-4" aria-label="Asistente">
      {status.data && (
        <p className={`flex items-center gap-1.5 text-xs ${unavailable ? 'text-warn' : 'text-muted'}`}>
          <Bot className="size-3.5" aria-hidden />
          {status.data.provider === 'FAKE' ? 'Modo de prueba (sin IA real)' : status.data.model}
          {unavailable && <> · {status.data.detail} <Link to="/settings" className="underline">Configurar</Link></>}
        </p>
      )}

      {!isLoading && items.length === 0 && !running && (
        <div className="rounded-lg border border-dashed border-line p-4 text-sm">
          <p className="font-medium">El asistente te ayuda a aclarar y planificar esto.</p>
          <p className="mt-1 text-muted">
            Lee el elemento y tus objetivos y proyectos, y pregunta solo lo que cambie el plan. Nada se modifica hasta que aceptes una
            propuesta.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => runTurn()} disabled={running}>
              <Sparkles className="size-4" aria-hidden /> Analizar
            </button>
            <button className="btn" onClick={() => runPropose('plan')} disabled={running}>
              <ListChecks className="size-4" aria-hidden /> Proponer un plan directamente
            </button>
          </div>
        </div>
      )}

      <ol className="space-y-3">
        {items.map((item) =>
          item.kind === 'message' ? (
            <li key={item.m.id}>
              <MessageBubble message={item.m} />
            </li>
          ) : (
            <li key={item.p.id}>
              <ProposalReview nodeId={node.id} proposal={item.p} />
            </li>
          ),
        )}
      </ol>

      {running && (
        <div className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm" role="status">
          <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />
          {propose.isPending ? 'Preparando la propuesta' : 'Pensando'}… {elapsed} s
          {status.data?.provider === 'OLLAMA' && elapsed > 15 && (
            <span className="text-xs text-muted">· con un modelo local puede tardar unos minutos</span>
          )}
        </div>
      )}

      {error && !running && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm" role="alert">
          <p className="text-danger">{errorMessage(error)}</p>
          <button
            className="btn mt-2 text-xs"
            onClick={() => (lastAction === 'turn' ? runTurn() : runPropose(lastAction))}
          >
            Reintentar
          </button>
        </div>
      )}

      <div ref={bottom} />

      {items.length > 0 && (
        <div className="sticky bottom-0 -mx-5 mt-auto space-y-2 border-t border-line bg-surface px-5 py-3">
          <form onSubmit={submit}>
            <label className="sr-only" htmlFor="assistant-input">
              Respuesta para el asistente
            </label>
            <textarea
              id="assistant-input"
              className="input"
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
              }}
              placeholder="Respondé o agregá contexto (Ctrl+Enter para enviar)…"
              disabled={running}
            />
          </form>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => submit()} disabled={!draft.trim() || running}>
              <Send className="size-4" aria-hidden /> Responder
            </button>
            <button className={`btn ${ready ? 'btn-primary' : ''}`} onClick={() => runPropose('plan')} disabled={running}>
              <ListChecks className="size-4" aria-hidden /> Proponer plan
            </button>
            <button className="btn" onClick={() => runPropose('reduce')} disabled={running} title="Partirlo en pasos chicos hasta tener algo para hacer hoy">
              <Scissors className="size-4" aria-hidden /> Reducir
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function MessageBubble({ message }: { message: AIMessageDTO }) {
  if (message.role === 'USER') {
    return <p className="ml-8 whitespace-pre-wrap rounded-lg bg-accent/10 px-3 py-2 text-sm">{message.content}</p>;
  }
  const s = message.structured;
  return (
    <div className="mr-4 space-y-2 rounded-lg border border-line px-3 py-2 text-sm">
      <p>{message.content}</p>
      {s?.interpretation && (
        <p className="text-muted">
          <span className="font-medium text-fg">Entendí: </span>
          {s.interpretation}
        </p>
      )}
      {s && s.assumptions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-warn">Supuestos sin confirmar</p>
          <ul className="ml-4 list-disc text-muted">
            {s.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {s && s.questions.length > 0 && (
        <ol className="ml-4 list-decimal space-y-1">
          {s.questions.map((q) => (
            <li key={q.text}>
              {q.text}
              {q.why && <span className="block text-xs text-muted">{q.why}</span>}
            </li>
          ))}
        </ol>
      )}
      {s?.enoughInfo && <p className="text-xs text-ok">Con esto ya se puede proponer un plan.</p>}
      <p className="text-[11px] text-muted">
        {message.model}
        {message.durationMs ? ` · ${duration(message.durationMs)}` : ''}
      </p>
    </div>
  );
}

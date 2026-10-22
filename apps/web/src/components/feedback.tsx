import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// ---------- Toasts ----------

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; onClick: () => void };
}

type ShowToast = (t: Omit<Toast, 'id' | 'tone'> & { tone?: Toast['tone'] }) => void;

const ToastContext = createContext<ShowToast>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const show = useCallback<ShowToast>(
    (t) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-3), { ...t, id, tone: t.tone ?? 'info' }]);
      setTimeout(() => dismiss(id), t.action ? 8000 : 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-lg px-4 py-2.5 text-sm shadow-lg ${
              t.tone === 'error' ? 'bg-danger text-white' : 'bg-fg text-bg'
            }`}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                className="font-semibold underline underline-offset-2"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------- Confirmation dialog ----------

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

type Confirm = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback<Confirm>((opts) => new Promise((resolve) => setPending({ ...opts, resolve })), []);
  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Modal onClose={() => close(false)} labelledBy="confirm-title">
          <h2 id="confirm-title" className="text-base font-semibold">
            {pending.title}
          </h2>
          {pending.message && <p className="mt-2 text-sm text-muted">{pending.message}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn" onClick={() => close(false)}>
              Cancelar
            </button>
            <button className={`btn ${pending.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>
              {pending.confirmLabel ?? 'Confirmar'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

// ---------- Modal ----------

export function Modal({
  children,
  onClose,
  labelledBy,
  wide,
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy?: string;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`card w-full ${wide ? 'max-w-xl' : 'max-w-md'} p-5 shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

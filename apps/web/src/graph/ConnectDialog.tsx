import { checkRelation, EDGE_TYPES, RELATION_RULES, type EdgeType, type NodeBrief } from '@backlog/shared';
import { useState } from 'react';
import { errorMessage } from '../api/client';
import { useCreateEdge } from '../api/hooks';
import { Modal, useToast } from '../components/feedback';

interface Option {
  key: string;
  type: EdgeType;
  source: NodeBrief;
  target: NodeBrief;
}

const CATEGORY_TITLE = { STRUCTURAL: 'Estructura', EXECUTION: 'Dependencia de ejecución', CONCEPTUAL: 'Relación conceptual' } as const;

/** Every relation allowed between two nodes, in either direction. */
function optionsFor(a: NodeBrief, b: NodeBrief): Option[] {
  const options: Option[] = [];
  for (const type of EDGE_TYPES) {
    const rule = RELATION_RULES[type];
    if (checkRelation(type, a.type, b.type).ok) options.push({ key: `${type}:ab`, type, source: a, target: b });
    if (!rule.symmetric && checkRelation(type, b.type, a.type).ok) options.push({ key: `${type}:ba`, type, source: b, target: a });
  }
  return options;
}

export function ConnectDialog({ a, b, onClose }: { a: NodeBrief; b: NodeBrief; onClose: () => void }) {
  const options = optionsFor(a, b);
  const [key, setKey] = useState(options[0]?.key ?? '');
  const create = useCreateEdge();
  const toast = useToast();
  const chosen = options.find((o) => o.key === key);

  function submit() {
    if (!chosen) return;
    create.mutate(
      { sourceId: chosen.source.id, targetId: chosen.target.id, type: chosen.type },
      {
        onSuccess: () => {
          toast({ message: 'Relación creada' });
          onClose();
        },
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  }

  return (
    <Modal onClose={onClose} labelledBy="connect-title" wide>
      <h2 id="connect-title" className="text-base font-semibold">
        ¿Cómo se relacionan?
      </h2>
      {options.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No hay relaciones posibles entre estos dos tipos de elemento.</p>
      ) : (
        <fieldset className="mt-3 max-h-80 space-y-1 overflow-y-auto">
          <legend className="sr-only">Tipo de relación</legend>
          {options.map((o) => (
            <label key={o.key} className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm ${key === o.key ? 'bg-accent/10' : 'hover:bg-subtle'}`}>
              <input type="radio" name="relation" className="mt-1 accent-[var(--color-accent)]" checked={key === o.key} onChange={() => setKey(o.key)} />
              <span>
                <span className="font-medium">{o.source.title}</span> <span className="text-accent">{RELATION_RULES[o.type].label}</span>{' '}
                <span className="font-medium">{o.target.title}</span>
                <span className="block text-xs text-muted">{CATEGORY_TITLE[RELATION_RULES[o.type].category]}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={!chosen || create.isPending} onClick={submit}>
          Crear relación
        </button>
      </div>
    </Modal>
  );
}

import type { NodeType, Priority, StatusCategory } from '@backlog/shared';

export const TYPE_LABEL: Record<NodeType, string> = {
  AREA: 'Área',
  GOAL: 'Objetivo',
  PROJECT: 'Proyecto',
  TASK: 'Tarea',
  IDEA: 'Idea',
  PROBLEM: 'Problema',
  NOTE: 'Nota',
  DECISION: 'Decisión',
  RESOURCE: 'Recurso',
  INBOX_ITEM: 'Sin clasificar',
};

/** Order used in type pickers (most common first). */
export const TYPE_ORDER: NodeType[] = ['TASK', 'IDEA', 'PROJECT', 'GOAL', 'PROBLEM', 'NOTE', 'DECISION', 'RESOURCE', 'AREA'];

export const TYPE_STYLE: Record<NodeType, string> = {
  AREA: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  GOAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  PROJECT: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  TASK: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  IDEA: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  PROBLEM: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  NOTE: 'bg-stone-500/15 text-stone-700 dark:text-stone-300',
  DECISION: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  RESOURCE: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  INBOX_ITEM: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  NONE: 'Sin prioridad',
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const PRIORITY_STYLE: Record<Priority, string> = {
  NONE: 'text-muted',
  LOW: 'text-muted',
  MEDIUM: 'text-warn',
  HIGH: 'text-danger',
  URGENT: 'text-danger font-semibold',
};

export const CATEGORY_LABEL: Record<StatusCategory, string> = {
  TODO: 'Por hacer',
  IN_PROGRESS: 'En curso',
  BLOCKED: 'Bloqueada',
  DONE: 'Terminada',
};

export const CATEGORY_STYLE: Record<StatusCategory, string> = {
  TODO: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
  IN_PROGRESS: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  BLOCKED: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  DONE: 'bg-green-500/15 text-green-700 dark:text-green-300',
};

// Must stay in sync with the enums in apps/api/prisma/schema.prisma
// (checked by apps/api/test/enums.test.ts).

export const NODE_TYPES = [
  'AREA',
  'GOAL',
  'PROJECT',
  'TASK',
  'IDEA',
  'PROBLEM',
  'NOTE',
  'DECISION',
  'RESOURCE',
  'INBOX_ITEM',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/** Types that carry an execution status (pendiente, en progreso, ...). */
export const ACTIONABLE_TYPES = ['GOAL', 'PROJECT', 'TASK'] as const satisfies readonly NodeType[];

export function isActionable(type: NodeType): boolean {
  return (ACTIONABLE_TYPES as readonly NodeType[]).includes(type);
}

export const EDGE_TYPES = [
  'CONTAINS',
  'PARENT_OF',
  'DEPENDS_ON',
  'RELATED_TO',
  'DOCUMENTS',
  'DEVELOPS',
  'INFORMS',
  'SUPPORTS',
  'DERIVED_FROM',
  'DUPLICATES',
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Whether a value was confirmed by the user or only suggested by the AI. */
export const VALUE_SOURCES = ['USER', 'AI_SUGGESTED'] as const;
export type ValueSource = (typeof VALUE_SOURCES)[number];

export const STATUS_CATEGORIES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const USER_ROLES = ['ADMIN', 'USER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACTORS = ['USER', 'AI'] as const;
export type Actor = (typeof ACTORS)[number];

export const ACTIVITY_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'RESTORE',
  'PURGE',
  'COMPLETE',
  'REOPEN',
  'LINK',
  'UNLINK',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

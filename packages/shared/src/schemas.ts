import { z } from 'zod';
import { EDGE_TYPES, NODE_TYPES, PRIORITIES, STATUS_CATEGORIES, USER_ROLES, VALUE_SOURCES } from './enums';

const trimmed = (max: number) => z.string().trim().max(max);
const isoDate = z.iso.date();

// ---------- Auth ----------

export const LoginInput = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const PasswordSchema = z.string().min(10, 'La contraseña debe tener al menos 10 caracteres').max(200);

export const RegisterInput = z.object({
  token: z.string().min(10).max(200),
  email: z.email().trim().toLowerCase(),
  name: trimmed(120).min(1),
  password: PasswordSchema,
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const CreateInvitationInput = z.object({
  email: z.email().trim().toLowerCase().optional(),
  role: z.enum(USER_ROLES).default('USER'),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});
export type CreateInvitationInput = z.infer<typeof CreateInvitationInput>;

// ---------- Nodes ----------

const nodeFields = {
  title: trimmed(300).min(1, 'El título no puede estar vacío'),
  body: z.string().max(100_000),
  statusId: z.uuid(),
  priority: z.enum(PRIORITIES),
  prioritySource: z.enum(VALUE_SOURCES),
  dueDate: isoDate,
  outcome: trimmed(5_000),
  doneCriteria: trimmed(5_000),
  nextAction: trimmed(1_000),
  effort: z.number().int().min(0).max(10_000),
  effortSource: z.enum(VALUE_SOURCES),
  url: z.url().max(2_000),
};

/** Only `title` is required: quick capture must stay frictionless. */
export const CreateNodeInput = z.object({
  type: z.enum(NODE_TYPES).default('INBOX_ITEM'),
  title: nodeFields.title,
  body: nodeFields.body.optional(),
  statusId: nodeFields.statusId.optional(),
  priority: nodeFields.priority.optional(),
  prioritySource: nodeFields.prioritySource.optional(),
  dueDate: nodeFields.dueDate.optional(),
  outcome: nodeFields.outcome.optional(),
  doneCriteria: nodeFields.doneCriteria.optional(),
  nextAction: nodeFields.nextAction.optional(),
  effort: nodeFields.effort.optional(),
  effortSource: nodeFields.effortSource.optional(),
  url: nodeFields.url.optional(),
  processed: z.boolean().optional(),
  /** Creates the structural relation (CONTAINS / PARENT_OF) in the same transaction. */
  parentId: z.uuid().optional(),
});
export type CreateNodeInput = z.infer<typeof CreateNodeInput>;

export const SetParentInput = z.object({ parentId: z.uuid().nullable() });
export type SetParentInput = z.infer<typeof SetParentInput>;

export const SimilarQuery = z.object({
  title: trimmed(300).min(3),
  excludeId: z.uuid().optional(),
});

/** `null` clears an optional field; `version` enables optimistic concurrency. */
export const UpdateNodeInput = z.object({
  version: z.number().int().min(1),
  type: z.enum(NODE_TYPES).optional(),
  title: nodeFields.title.optional(),
  body: nodeFields.body.optional(),
  statusId: nodeFields.statusId.nullable().optional(),
  priority: nodeFields.priority.nullable().optional(),
  prioritySource: nodeFields.prioritySource.nullable().optional(),
  dueDate: nodeFields.dueDate.nullable().optional(),
  outcome: nodeFields.outcome.nullable().optional(),
  doneCriteria: nodeFields.doneCriteria.nullable().optional(),
  nextAction: nodeFields.nextAction.nullable().optional(),
  effort: nodeFields.effort.nullable().optional(),
  effortSource: nodeFields.effortSource.nullable().optional(),
  url: nodeFields.url.nullable().optional(),
  processed: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export type UpdateNodeInput = z.infer<typeof UpdateNodeInput>;

const csv = <T extends z.ZodType<string, string>>(item: T) =>
  z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(item));

const boolString = z.enum(['true', 'false']).transform((v) => v === 'true');

export const ListNodesQuery = z.object({
  type: csv(z.enum(NODE_TYPES)).optional(),
  statusCategory: csv(z.enum(STATUS_CATEGORIES)).optional(),
  processed: boolString.optional(),
  archived: z.enum(['exclude', 'include', 'only']).default('exclude'),
  deleted: boolString.default(false),
  q: trimmed(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListNodesQuery = z.infer<typeof ListNodesQuery>;

// ---------- Edges ----------

export const CreateEdgeInput = z.object({
  sourceId: z.uuid(),
  targetId: z.uuid(),
  type: z.enum(EDGE_TYPES),
  note: trimmed(1_000).optional(),
});
export type CreateEdgeInput = z.infer<typeof CreateEdgeInput>;

export const IdParam = z.object({ id: z.uuid() });

// ---------- Statuses ----------

export const CreateStatusInput = z.object({
  name: trimmed(60).min(1),
  category: z.enum(STATUS_CATEGORIES),
});
export type CreateStatusInput = z.infer<typeof CreateStatusInput>;

export const UpdateStatusInput = z.object({
  name: trimmed(60).min(1).optional(),
  category: z.enum(STATUS_CATEGORIES).optional(),
  isDefault: z.literal(true).optional(),
});
export type UpdateStatusInput = z.infer<typeof UpdateStatusInput>;

export const ReorderStatusesInput = z.object({ ids: z.array(z.uuid()).min(1) });

export const DeleteStatusQuery = z.object({ moveTo: z.uuid().optional() });

// ---------- Comments ----------

export const CommentInput = z.object({ body: trimmed(20_000).min(1) });

// ---------- Views ----------

export const ViewQuery = z.object({
  /** The client's local date, so "today" matches the user's timezone. */
  date: isoDate,
  /** The client's local midnight as an ISO timestamp (for "completed today"). */
  since: z.iso.datetime({ offset: true }).optional(),
  days: z.coerce.number().int().min(1).max(90).default(14),
});
export type ViewQuery = z.infer<typeof ViewQuery>;

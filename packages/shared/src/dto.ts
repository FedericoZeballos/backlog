// Response shapes of the API (apps/api), consumed by the web client.

import type { EdgeCategory } from './relations';
import type {
  ActivityAction,
  Actor,
  EdgeType,
  NodeType,
  Priority,
  StatusCategory,
  UserRole,
  ValueSource,
} from './enums';

export interface StatusRef {
  id: string;
  name: string;
  category: StatusCategory;
}

export interface NodeDTO {
  id: string;
  type: NodeType;
  title: string;
  body: string;
  slug: string;
  status: StatusRef | null;
  priority: Priority | null;
  prioritySource: ValueSource | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  outcome: string | null;
  doneCriteria: string | null;
  nextAction: string | null;
  effort: number | null;
  effortSource: ValueSource | null;
  url: string | null;
  processed: boolean;
  completedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface NodeBrief {
  id: string;
  title: string;
  type: NodeType;
}

/** Items returned by the execution views (today, upcoming, blocked, backlog). */
export interface ViewNodeDTO extends NodeDTO {
  parent: NodeBrief | null;
  blockers: NodeBrief[];
}

export interface TreeNodeDTO extends NodeDTO {
  parentId: string | null;
}

export interface RelationDTO {
  id: string;
  type: EdgeType;
  category: EdgeCategory;
  /** 'out': this node is the source. */
  direction: 'out' | 'in';
  note: string | null;
  createdBy: Actor;
  createdAt: string;
  node: NodeBrief & { version: number; status: StatusRef | null };
}

export interface NodeDetailDTO {
  node: NodeDTO;
  relations: RelationDTO[];
}

export interface StatusDTO extends StatusRef {
  order: number;
  isDefault: boolean;
}

export interface CommentDTO {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityDTO {
  id: string;
  actor: Actor;
  action: ActivityAction;
  edgeId: string | null;
  diff: { before?: Record<string, unknown>; after?: Record<string, unknown>; reason?: string } | null;
  createdAt: string;
}

export interface SimilarNodeDTO extends NodeBrief {
  score: number;
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  disabledAt?: string | null;
  createdAt?: string;
}

export interface InvitationDTO {
  id: string;
  email: string | null;
  role: UserRole;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  usedBy: { id: string; email: string; name: string } | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

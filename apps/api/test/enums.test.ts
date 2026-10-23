import * as shared from '@backlog/shared';
import { $Enums } from '@prisma/client';
import { describe, expect, it } from 'vitest';

describe('shared enums match the Prisma schema', () => {
  it.each([
    ['NodeType', shared.NODE_TYPES],
    ['EdgeType', shared.EDGE_TYPES],
    ['Priority', shared.PRIORITIES],
    ['ValueSource', shared.VALUE_SOURCES],
    ['StatusCategory', shared.STATUS_CATEGORIES],
    ['UserRole', shared.USER_ROLES],
    ['Actor', shared.ACTORS],
    ['ActivityAction', shared.ACTIVITY_ACTIONS],
    ['AIProvider', shared.AI_PROVIDERS],
  ] as const)('%s', (name, values) => {
    expect(Object.values($Enums[name]).sort()).toEqual([...values].sort());
  });
});

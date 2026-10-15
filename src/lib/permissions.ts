/**
 * The single source of truth for what each workspace role may do.
 * The server enforces it (src/server/auth/workspace.ts); the UI only uses it to hide controls.
 */
export const ROLES = ['OWNER', 'ADMIN', 'PUBLISHER', 'ANALYST'] as const;
export type Role = (typeof ROLES)[number];

const ALL: readonly Role[] = ROLES;
const MANAGERS: readonly Role[] = ['OWNER', 'ADMIN'];
const CREATORS: readonly Role[] = ['OWNER', 'ADMIN', 'PUBLISHER'];

export const PERMISSIONS = {
  'workspace.view': ALL,
  'workspace.update': MANAGERS,
  'workspace.delete': ['OWNER'],
  'members.view': ALL,
  'members.manage': MANAGERS,
  'channels.view': ALL,
  'channels.manage': MANAGERS,
  'posts.view': ALL,
  'posts.edit': CREATORS,
  'posts.publish': CREATORS,
  'queue.manage': MANAGERS,
  'media.view': ALL,
  'media.upload': CREATORS,
  'media.delete': CREATORS,
  'tags.manage': CREATORS,
  'analytics.view': ALL,
  'community.view': ALL,
  'community.reply': CREATORS,
  'savedReplies.manage': MANAGERS,
  'billing.view': MANAGERS,
  'billing.manage': ['OWNER'],
  'audit.view': MANAGERS,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  PUBLISHER: 'Publisher',
  ANALYST: 'Analyst',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  OWNER: 'Full access, including billing and deleting the workspace.',
  ADMIN: 'Manages channels, members, queue and settings. No billing changes.',
  PUBLISHER: 'Creates, schedules and publishes posts, and replies to comments.',
  ANALYST: 'Read-only access to posts, calendar and insights.',
};

/** Roles an actor may assign. Only owners can create other owners. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === 'OWNER') return [...ROLES];
  if (actor === 'ADMIN') return ['ADMIN', 'PUBLISHER', 'ANALYST'];
  return [];
}

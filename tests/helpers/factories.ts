import { db } from '@/server/db';
import { createWorkspace } from '@/server/services/workspaces';
import { loadCtx, type WorkspaceCtx } from '@/server/auth/ctx';
import type { Role } from '@/lib/permissions';
import { encrypt } from '@/server/crypto';

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function makeUser(opts: { verified?: boolean; name?: string } = {}) {
  return db.user.create({
    data: {
      email: `user-${uid()}@example.test`,
      name: opts.name ?? 'Test User',
      emailVerified: opts.verified === false ? null : new Date(),
    },
  });
}

/** A workspace with an owner, returning the owner's context. */
export async function makeWorkspace(name = 'Acme') {
  const owner = await makeUser({ name: `${name} Owner` });
  const ws = await createWorkspace(owner.id, { name, timezone: 'Asia/Kolkata' });
  const ctx = (await loadCtx(owner, { id: ws.id }))!;
  return { ws, owner, ctx };
}

export async function addMember(workspaceId: string, role: Role): Promise<WorkspaceCtx> {
  const user = await makeUser({ name: `${role} member` });
  await db.workspaceMember.create({ data: { workspaceId, userId: user.id, role } });
  return (await loadCtx(user, { id: workspaceId }))!;
}

export async function makeChannel(workspaceId: string, platform: 'INSTAGRAM' | 'FACEBOOK' = 'FACEBOOK') {
  return db.socialAccount.create({
    data: {
      workspaceId,
      platform,
      externalId: `ext-${uid()}`,
      name: `${platform === 'INSTAGRAM' ? 'IG' : 'FB'} channel`,
      username: platform === 'INSTAGRAM' ? `ig_${uid()}` : null,
      accessTokenEnc: encrypt('mock-token'),
      mode: 'MOCK',
      scopes: [],
    },
  });
}

import 'server-only';
import { cache } from 'react';
import { notFound as nextNotFound } from 'next/navigation';
import type { Permission } from '@/lib/permissions';
import { notFound } from '../errors';
import { requireUser, requireUserPage } from './session';
import { assertCan, loadCtx, type WorkspaceCtx } from './ctx';

export * from './ctx';

/** For route handlers (workspace id comes from the URL and is always re-checked). */
export async function requireWorkspace(workspaceId: string, permission: Permission = 'workspace.view'): Promise<WorkspaceCtx> {
  const user = await requireUser();
  const ctx = await loadCtx(user, { id: workspaceId });
  if (!ctx) throw notFound('Workspace');
  assertCan(ctx, permission);
  return ctx;
}

/** For server components under /w/[slug]. Renders the 404 page for non-members. */
export const requireWorkspacePage = cache(async (slug: string): Promise<WorkspaceCtx> => {
  const user = await requireUserPage();
  const ctx = await loadCtx(user, { slug });
  if (!ctx) nextNotFound();
  return ctx;
});


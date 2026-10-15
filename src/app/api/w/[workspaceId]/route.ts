import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { deleteWorkspace, updateWorkspace, workspaceSummary, workspaceUpdateSchema } from '@/server/services/workspaces';

type P = { workspaceId: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId);
  return { workspace: await workspaceSummary(ctx) };
});

export const PATCH = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'workspace.update');
  const input = await parseJson(req, workspaceUpdateSchema);
  return { workspace: await updateWorkspace(ctx, input) };
});

export const DELETE = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'workspace.delete');
  const { confirmName } = await parseJson(req, z.object({ confirmName: z.string() }));
  await deleteWorkspace(ctx, confirmName);
});

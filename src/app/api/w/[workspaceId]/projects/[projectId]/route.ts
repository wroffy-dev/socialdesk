import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { deleteProject, projectInputSchema, updateProject } from '@/server/services/projects';

type P = { workspaceId: string; projectId: string };

export const PATCH = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'channels.manage');
  return { project: await updateProject(ctx, params.projectId, await parseJson(req, projectInputSchema)) };
});

export const DELETE = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'channels.manage');
  await deleteProject(ctx, params.projectId);
});

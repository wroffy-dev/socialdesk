import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { createProject, listProjects, projectInputSchema } from '@/server/services/projects';

type P = { workspaceId: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'channels.view');
  return listProjects(ctx);
});

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'channels.manage');
  return { project: await createProject(ctx, await parseJson(req, projectInputSchema)) };
});

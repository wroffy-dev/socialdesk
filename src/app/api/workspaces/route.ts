import { route, parseJson } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { createWorkspace, listUserWorkspaces, workspaceInputSchema } from '@/server/services/workspaces';
import { enforceRateLimit } from '@/server/rate-limit';

export const GET = route(async () => {
  const user = await requireUser();
  return { workspaces: await listUserWorkspaces(user.id) };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit(`ws-create:${user.id}`, 10, 60 * 60);
  const input = await parseJson(req, workspaceInputSchema);
  const ws = await createWorkspace(user.id, input);
  return { workspace: { id: ws.id, slug: ws.slug, name: ws.name } };
});

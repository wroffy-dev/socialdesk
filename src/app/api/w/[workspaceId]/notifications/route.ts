import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { getNotificationPrefs, notificationPrefsSchema, updateNotificationPrefs } from '@/server/services/settings';

type P = { workspaceId: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId);
  return { prefs: await getNotificationPrefs(ctx) };
});

export const PUT = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId);
  return { prefs: await updateNotificationPrefs(ctx, await parseJson(req, notificationPrefsSchema)) };
});

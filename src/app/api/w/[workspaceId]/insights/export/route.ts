import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { exportInsightsCsv } from '@/server/services/insights';
import { audit } from '@/server/audit';

type P = { workspaceId: string };

export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'analytics.view');
  const { filename, body } = await exportInsightsCsv(ctx, Object.fromEntries(req.nextUrl.searchParams));
  await audit({ action: 'analytics.exported', actorId: ctx.user.id, workspaceId: ctx.workspace.id });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});

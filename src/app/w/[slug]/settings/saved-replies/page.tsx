import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { listSavedReplies } from '@/server/services/settings';
import { SavedRepliesManager } from '@/components/settings/saved-replies-manager';

export const metadata = { title: 'Saved replies' };

export default async function SavedRepliesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  const replies = await listSavedReplies(ctx);
  return (
    <SavedRepliesManager
      workspaceId={ctx.workspace.id}
      initial={replies.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }))}
      canManage={hasPermission(ctx, 'savedReplies.manage')}
    />
  );
}

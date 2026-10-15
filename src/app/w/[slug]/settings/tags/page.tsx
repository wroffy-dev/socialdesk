import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { listTags } from '@/server/services/tags';
import { TagsManager } from '@/components/settings/tags-manager';

export const metadata = { title: 'Tags' };

export default async function TagsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  return <TagsManager workspaceId={ctx.workspace.id} initial={await listTags(ctx)} canManage={hasPermission(ctx, 'tags.manage')} />;
}

import { MessagesSquare } from 'lucide-react';
import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { db } from '@/server/db';
import { communityStatus } from '@/server/services/community';
import { listSavedReplies } from '@/server/services/settings';
import { PageHeader } from '@/components/page-header';
import { CommunityInbox } from '@/components/community/inbox';

export const metadata = { title: 'Community' };

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  const [channels, replies, members] = await Promise.all([
    communityStatus(ctx),
    listSavedReplies(ctx),
    db.workspaceMember.findMany({ where: { workspaceId: ctx.workspace.id, role: { not: 'ANALYST' } }, select: { user: { select: { id: true, name: true, email: true } } } }),
  ]);
  return (
    <>
      <PageHeader icon={<MessagesSquare />} title="Community" description="Comments on your published posts, from channels that allow it." />
      <CommunityInbox
        workspace={{ id: ctx.workspace.id, slug }}
        channels={channels}
        savedReplies={replies.map((r) => ({ id: r.id, title: r.title, body: r.body }))}
        members={members.map((m) => m.user)}
        canReply={hasPermission(ctx, 'community.reply')}
        currentUserId={ctx.user.id}
      />
    </>
  );
}

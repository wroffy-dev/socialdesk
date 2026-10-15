'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarX2, Copy, MoreHorizontal, Pencil, RotateCw, Send, Trash2, Undo2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/ui/confirm';
import { api, errorMessage } from '@/lib/api-client';

interface Target {
  id: string;
  status: string;
  versions: { id: string; status: string }[];
}

/** Row/detail actions for a post, shown according to its status and the user's permissions. */
export function PostActionsMenu({
  post,
  workspace,
  canEdit,
  canPublish,
  onChanged,
  trigger,
}: {
  post: Target;
  workspace: { id: string; slug: string };
  canEdit: boolean;
  canPublish: boolean;
  onChanged?: () => void;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const apiBase = `/api/w/${workspace.id}`;
  const base = `/w/${workspace.slug}`;
  const editable = ['DRAFT', 'SCHEDULED', 'FAILED', 'CANCELLED'].includes(post.status) && !post.versions.some((v) => ['PUBLISHING', 'PUBLISHED', 'NEEDS_VERIFICATION'].includes(v.status));
  const failed = post.versions.filter((v) => v.status === 'FAILED');

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast.success(success);
      onChanged?.();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon-sm" aria-label="Post actions" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
        {canEdit && editable && (
          <DropdownMenuItem onSelect={() => router.push(`${base}/compose/${post.id}`)}>
            <Pencil /> Edit
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem
            onSelect={() =>
              run(async () => {
                const { post: copy } = await api<{ post: { id: string } }>(`${apiBase}/posts/${post.id}/duplicate`, { method: 'POST' });
                router.push(`${base}/compose/${copy.id}`);
              }, 'Post duplicated as a draft')
            }
          >
            <Copy /> Duplicate
          </DropdownMenuItem>
        )}
        {canPublish && post.status === 'DRAFT' && post.versions.length > 0 && (
          <DropdownMenuItem
            onSelect={async () => {
              if (!(await confirm({ title: 'Publish now?', description: 'This draft will be published to its channels right away.', confirmLabel: 'Publish now' }))) return;
              await run(() => api(`${apiBase}/posts/${post.id}/schedule`, { body: { type: 'publish_now' } }), 'Publishing started');
            }}
          >
            <Send /> Publish now
          </DropdownMenuItem>
        )}
        {canPublish && failed.length > 0 && (
          <DropdownMenuItem
            onSelect={() =>
              run(async () => {
                for (const v of failed) await api(`${apiBase}/versions/${v.id}/retry`, { body: {} });
              }, `Retrying ${failed.length} failed channel${failed.length > 1 ? 's' : ''}`)
            }
          >
            <RotateCw /> Retry failed
          </DropdownMenuItem>
        )}
        {canPublish && post.status === 'SCHEDULED' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => run(() => api(`${apiBase}/posts/${post.id}/cancel`, { body: { toDraft: true } }), 'Moved back to drafts')}>
              <Undo2 /> Unschedule
            </DropdownMenuItem>
            <DropdownMenuItem
              destructive
              onSelect={async () => {
                if (!(await confirm({ title: 'Cancel this post?', description: 'It will not be published. You can still duplicate it later.', confirmLabel: 'Cancel post', destructive: true })))
                  return;
                await run(() => api(`${apiBase}/posts/${post.id}/cancel`, { body: { toDraft: false } }), 'Post cancelled');
              }}
            >
              <XCircle /> Cancel post
            </DropdownMenuItem>
          </>
        )}
        {canPublish && post.status === 'CANCELLED' && (
          <DropdownMenuItem onSelect={() => run(() => api(`${apiBase}/posts/${post.id}/cancel`, { body: { toDraft: true } }), 'Moved back to drafts')}>
            <CalendarX2 /> Move to drafts
          </DropdownMenuItem>
        )}
        {canEdit && ['DRAFT', 'CANCELLED', 'FAILED'].includes(post.status) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={async () => {
                if (!(await confirm({ title: 'Delete this post?', description: 'This cannot be undone.', confirmLabel: 'Delete', destructive: true }))) return;
                await run(() => api(`${apiBase}/posts/${post.id}`, { method: 'DELETE' }), 'Post deleted');
              }}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

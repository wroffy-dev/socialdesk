'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/feedback';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { api, errorMessage } from '@/lib/api-client';
import { SettingsSection } from './section';

type Reply = { id: string; title: string; body: string; updatedAt: string };

export function SavedRepliesManager({ workspaceId, initial, canManage }: { workspaceId: string; initial: Reply[]; canManage: boolean }) {
  const confirm = useConfirm();
  const [replies, setReplies] = useState(initial);
  const [editing, setEditing] = useState<Partial<Reply> | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const body = { title: editing.title ?? '', body: editing.body ?? '' };
      if (editing.id) {
        await api(`/api/w/${workspaceId}/saved-replies/${editing.id}`, { method: 'PATCH', body });
        setReplies((cur) => cur.map((r) => (r.id === editing.id ? { ...r, ...body } : r)));
      } else {
        const { reply } = await api<{ reply: Reply }>(`/api/w/${workspaceId}/saved-replies`, { body });
        setReplies((cur) => [...cur, reply]);
      }
      setEditing(null);
      toast.success('Saved reply stored');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title="Saved replies" description="Reusable answers your team can insert when replying to comments.">
      {canManage && (
        <Button variant="primary" className="mb-4" onClick={() => setEditing({ title: '', body: '' })}>
          <Plus /> New saved reply
        </Button>
      )}
      {replies.length === 0 ? (
        <EmptyState title="No saved replies yet" />
      ) : (
        <ul className="-my-2 divide-y divide-line">
          {replies.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">{r.title}</p>
                <p className="line-clamp-2 text-[13px] text-muted">{r.body}</p>
              </div>
              {canManage && (
                <>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(r)} aria-label={`Edit ${r.title}`}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${r.title}`}
                    onClick={async () => {
                      if (!(await confirm({ title: `Delete "${r.title}"?`, confirmLabel: 'Delete', destructive: true }))) return;
                      try {
                        await api(`/api/w/${workspaceId}/saved-replies/${r.id}`, { method: 'DELETE' });
                        setReplies((cur) => cur.filter((x) => x.id !== r.id));
                      } catch (err) {
                        toast.error(errorMessage(err));
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit saved reply' : 'New saved reply'}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Field label="Title" htmlFor="sr-title">
              <Input id="sr-title" value={editing?.title ?? ''} onChange={(e) => setEditing((x) => ({ ...x, title: e.target.value }))} maxLength={80} />
            </Field>
            <Field label="Reply" htmlFor="sr-body">
              <Textarea id="sr-body" value={editing?.body ?? ''} onChange={(e) => setEditing((x) => ({ ...x, body: e.target.value }))} maxLength={2000} className="min-h-[120px]" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={busy} disabled={!editing?.title?.trim() || !editing?.body?.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

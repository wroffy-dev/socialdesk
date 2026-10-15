'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { LogOut, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Avatar } from '@/components/ui/avatar';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { TimezoneSelect } from '@/components/workspace/timezone-select';
import { api, errorMessage } from '@/lib/api-client';
import { SettingsSection } from './section';

const schema = z.object({ name: z.string().trim().min(2, 'Use at least 2 characters').max(60), timezone: z.string().min(1) });

export function GeneralSettings({
  workspace,
  memberId,
  canEdit,
  canDelete,
}: {
  workspace: { id: string; slug: string; name: string; timezone: string; logoUrl: string | null };
  memberId: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [logo, setLogo] = useState(workspace.logoUrl);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { name: workspace.name, timezone: workspace.timezone } });
  const { errors, isSubmitting, isDirty } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api(`/api/w/${workspace.id}`, { method: 'PATCH', body: values });
      toast.success('Workspace updated');
      form.reset(values);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api<{ logoUrl: string }>(`/api/w/${workspace.id}/logo`, { body: fd });
      setLogo(res.logoUrl);
      toast.success('Logo updated');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection title="Workspace profile" description="Shown to your team in the workspace switcher.">
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex items-center gap-4">
            <Avatar name={workspace.name} src={logo} size={56} rounded="md" />
            {canEdit && (
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                  <Upload /> Upload logo
                </Button>
                {logo && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await api(`/api/w/${workspace.id}/logo`, { method: 'DELETE' }).catch((e) => toast.error(errorMessage(e)));
                      setLogo(null);
                      router.refresh();
                    }}
                  >
                    Remove
                  </Button>
                )}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void uploadLogo(e.target.files?.[0])} />
              </div>
            )}
          </div>
          <Field label="Name" htmlFor="ws-name" error={errors.name?.message}>
            <Input id="ws-name" disabled={!canEdit} {...form.register('name')} />
          </Field>
          <Field label="Timezone" htmlFor="ws-tz" hint="The calendar, queue times and scheduling default to this timezone.">
            <TimezoneSelect id="ws-tz" disabled={!canEdit} {...form.register('timezone')} defaultValue={workspace.timezone} />
          </Field>
          {canEdit && (
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty}>
                Save changes
              </Button>
            </div>
          )}
        </form>
      </SettingsSection>

      <SettingsSection title="Leave workspace" description="You'll lose access to this workspace's posts and channels.">
        <Button
          variant="outline"
          onClick={async () => {
            if (!(await confirm({ title: `Leave ${workspace.name}?`, confirmLabel: 'Leave', destructive: true }))) return;
            try {
              await api(`/api/w/${workspace.id}/members/${memberId}`, { method: 'DELETE' });
              router.push('/app');
              router.refresh();
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          <LogOut /> Leave workspace
        </Button>
      </SettingsSection>

      {canDelete && (
        <SettingsSection danger title="Delete workspace" description="Permanently deletes all posts, media, channels and settings in this workspace. This cannot be undone.">
          <Button variant="danger-outline" onClick={() => setDeleteOpen(true)}>
            <Trash2 /> Delete workspace
          </Button>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {workspace.name}?</DialogTitle>
                <DialogDescription>Type the workspace name to confirm. Scheduled posts will not be published.</DialogDescription>
              </DialogHeader>
              <DialogBody>
                <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={workspace.name} aria-label="Workspace name" />
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={confirmName !== workspace.name}
                  loading={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await api(`/api/w/${workspace.id}`, { method: 'DELETE', body: { confirmName } });
                      router.push('/app');
                      router.refresh();
                    } catch (err) {
                      toast.error(errorMessage(err));
                      setDeleting(false);
                    }
                  }}
                >
                  Delete permanently
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </SettingsSection>
      )}
    </div>
  );
}

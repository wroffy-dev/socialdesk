'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { api, errorMessage } from '@/lib/api-client';

/** A button that POSTs an admin action after confirmation and refreshes the page. */
export function AdminAction({
  url,
  body,
  label,
  confirmTitle,
  confirmText,
  destructive,
  variant = 'outline',
  askReason,
}: {
  url: string;
  body: Record<string, unknown>;
  label: string;
  confirmTitle: string;
  confirmText?: string;
  destructive?: boolean;
  variant?: ButtonProps['variant'];
  askReason?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant={variant}
      loading={busy}
      onClick={async () => {
        if (!(await confirm({ title: confirmTitle, description: confirmText, confirmLabel: label, destructive }))) return;
        const reason = askReason ? (window.prompt('Reason (shown to the workspace)') ?? undefined) : undefined;
        setBusy(true);
        try {
          await api(url, { body: { ...body, ...(reason ? { reason } : {}) } });
          toast.success('Done');
          router.refresh();
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}

export function PlanSelect({ workspaceId, current, plans }: { workspaceId: string; current: string; plans: { key: string; name: string }[] }) {
  const router = useRouter();
  return (
    <NativeSelect
      defaultValue={current}
      className="h-8 w-28 text-[13px]"
      aria-label="Plan"
      onChange={async (e) => {
        try {
          await api(`/api/admin/workspaces/${workspaceId}`, { body: { action: 'set_plan', planKey: e.target.value } });
          toast.success('Plan updated');
          router.refresh();
        } catch (err) {
          toast.error(errorMessage(err));
          e.target.value = current;
        }
      }}
    >
      {plans.map((p) => (
        <option key={p.key} value={p.key}>
          {p.name}
        </option>
      ))}
    </NativeSelect>
  );
}

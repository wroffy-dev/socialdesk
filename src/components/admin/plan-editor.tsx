'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api, errorMessage } from '@/lib/api-client';
import { ENTITLEMENT_LABEL, type EntitlementKey } from '@/server/billing/catalog';

interface Plan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  priceAmount: number;
  currency: string;
  razorpayPlanId: string | null;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  subscriptions: number;
  entitlements: { key: string; enabled: boolean; limit: number | null }[];
}

const KEYS = Object.keys(ENTITLEMENT_LABEL) as EntitlementKey[];

export function PlanEditor({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [p, setP] = useState(plan);
  const [busy, setBusy] = useState(false);
  const ent = (key: string) => p.entitlements.find((e) => e.key === key) ?? { key, enabled: false, limit: null };
  const setEnt = (key: string, patch: Partial<{ enabled: boolean; limit: number | null }>) =>
    setP((cur) => ({ ...cur, entitlements: [...cur.entitlements.filter((e) => e.key !== key), { ...ent(key), ...patch }] }));

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{plan.name}</h2>
        <code className="text-xs text-muted">{plan.key}</code>
        <Badge>{plan.subscriptions} workspaces</Badge>
        <label className="ml-auto flex items-center gap-2 text-[13px]">
          Active <Switch checked={p.isActive} onCheckedChange={(v) => setP({ ...p, isActive: v })} />
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          Public <Switch checked={p.isPublic} onCheckedChange={(v) => setP({ ...p, isPublic: v })} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-[13px]">
          Name
          <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          Price (paise / {plan.currency})
          <Input type="number" min={0} value={p.priceAmount} onChange={(e) => setP({ ...p, priceAmount: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          Razorpay plan id
          <Input value={p.razorpayPlanId ?? ''} placeholder="plan_..." onChange={(e) => setP({ ...p, razorpayPlanId: e.target.value || null })} />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          Sort order
          <Input type="number" min={0} value={p.sortOrder} onChange={(e) => setP({ ...p, sortOrder: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] sm:col-span-2 lg:col-span-4">
          Description
          <Input value={p.description ?? ''} onChange={(e) => setP({ ...p, description: e.target.value || null })} />
        </label>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {KEYS.map((k) => {
          const e = ent(k);
          const boolean = k === 'analytics_export';
          return (
            <div key={k} className="flex items-center gap-2 rounded-md bg-subtle px-3 py-2 text-[13px]">
              <Checkbox checked={e.enabled} onCheckedChange={(v) => setEnt(k, { enabled: !!v })} aria-label={`${ENTITLEMENT_LABEL[k]} enabled`} />
              <span className="flex-1">{ENTITLEMENT_LABEL[k]}</span>
              {!boolean && (
                <Input
                  type="number"
                  min={0}
                  placeholder="∞"
                  value={e.limit ?? ''}
                  disabled={!e.enabled}
                  onChange={(ev) => setEnt(k, { limit: ev.target.value === '' ? null : Number(ev.target.value) })}
                  className="h-7 w-20 text-[13px]"
                  aria-label={`${ENTITLEMENT_LABEL[k]} limit`}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/admin/plans/${plan.id}`, {
                method: 'PUT',
                body: {
                  name: p.name,
                  description: p.description,
                  priceAmount: p.priceAmount,
                  currency: p.currency,
                  razorpayPlanId: p.razorpayPlanId,
                  isActive: p.isActive,
                  isPublic: p.isPublic,
                  sortOrder: p.sortOrder,
                  entitlements: KEYS.map((k) => ({ key: k, enabled: ent(k).enabled, limit: ent(k).limit })),
                },
              });
              toast.success(`${p.name} saved`);
              router.refresh();
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Save {plan.name}
        </Button>
      </div>
    </Card>
  );
}

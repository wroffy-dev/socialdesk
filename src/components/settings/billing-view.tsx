'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useConfirm } from '@/components/ui/confirm';
import { api, errorMessage } from '@/lib/api-client';
import { cn, formatMoney } from '@/lib/utils';
import { bestYearlySavings, yearlySavingsPct, type BillingInterval } from '@/lib/pricing';
import { IntervalToggle } from '@/components/marketing/pricing-plans';
import type { getBilling } from '@/server/services/billing';
import { SettingsSection } from './section';

type Billing = Awaited<ReturnType<typeof getBilling>>;

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

function loadCheckoutScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window.'));
    document.body.appendChild(s);
  });
}

export function BillingView({ workspaceId, initial, canManage }: { workspaceId: string; initial: Billing; canManage: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState(false);
  const savings = bestYearlySavings(data.plans);
  const [interval, setInterval] = useState<BillingInterval>(data.subscription?.interval ?? 'month');

  // After checkout, wait for the verified webhook to switch the plan.
  useEffect(() => {
    if (!awaiting) return;
    const started = Date.now();
    const t = window.setInterval(async () => {
      const fresh = await api<Billing>(`/api/w/${workspaceId}/billing`).catch(() => null);
      if (fresh) setData(fresh);
      if ((fresh && !fresh.subscription?.pendingPlanId) || Date.now() - started > 120_000) {
        setAwaiting(false);
        router.refresh();
      }
    }, 4000);
    return () => window.clearInterval(t);
  }, [awaiting, workspaceId, router]);

  const upgrade = async (planKey: string) => {
    setBusy(planKey);
    try {
      const co = await api<{ subscriptionId: string; keyId: string; planName: string }>(`/api/w/${workspaceId}/billing/checkout`, { body: { planKey, interval } });
      await loadCheckoutScript();
      new window.Razorpay!({
        key: co.keyId,
        subscription_id: co.subscriptionId,
        name: 'SocialDesk',
        description: `${co.planName} plan, billed ${interval === 'year' ? 'yearly' : 'monthly'}`,
        theme: { color: '#3d7a2a' },
        // The browser callback is only a hint; the plan changes after the signed webhook arrives.
        handler: () => {
          toast.success('Payment received. Activating your plan…');
          setAwaiting(true);
        },
      }).open();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const paid = data.subscription?.provider === 'RAZORPAY';
  return (
    <div className="flex flex-col gap-5">
      {!data.billingEnabled && (
        <Alert variant="info" title="Free beta">
          SocialDesk is in free beta. Paid plans will be available soon; your current limits are shown below.
        </Alert>
      )}
      {awaiting && <Alert variant="info">Waiting for payment confirmation from Razorpay. This usually takes a few seconds.</Alert>}

      <SettingsSection title="Current plan">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xl font-semibold">{data.plan.name}</span>
          {data.subscription && (
            <Badge variant={data.subscription.status === 'ACTIVE' ? 'success' : 'warning'}>{data.subscription.status.toLowerCase().replace('_', ' ')}</Badge>
          )}
          {paid && <span className="text-[13px] text-muted">Billed {data.subscription?.interval === 'year' ? 'yearly' : 'monthly'}</span>}
          {data.subscription?.cancelAtPeriodEnd && data.subscription.currentPeriodEnd && (
            <span className="text-[13px] text-muted">Ends {new Date(data.subscription.currentPeriodEnd).toLocaleDateString()}</span>
          )}
          {paid && canManage && !data.subscription?.cancelAtPeriodEnd && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              loading={busy === 'cancel'}
              onClick={async () => {
                if (!(await confirm({ title: 'Cancel subscription?', description: 'Your plan stays active until the end of the current billing period, then moves to Free.', confirmLabel: 'Cancel subscription', destructive: true }))) return;
                setBusy('cancel');
                try {
                  await api(`/api/w/${workspaceId}/billing/cancel`, { method: 'POST' });
                  setData(await api<Billing>(`/api/w/${workspaceId}/billing`));
                  toast.success('Subscription will end at the period end');
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setBusy(null);
                }
              }}
            >
              Cancel subscription
            </Button>
          )}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {data.usage.map((u) => {
            const pct = u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0;
            return (
              <div key={u.key}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span>{u.label}</span>
                  <span className="tabular-nums text-muted">
                    {u.used} / {u.limit ?? '∞'}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={u.label}>
                  <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-accent-ink')} style={{ width: `${u.limit ? pct : 4}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Plans">
        {savings > 0 && <IntervalToggle value={interval} onChange={setInterval} savings={savings} className="mb-4" />}
        <div className="grid gap-3 lg:grid-cols-2">
          {data.plans.map((p) => {
            const current = p.key === data.plan.key;
            const yearly = interval === 'year' && p.yearlyPriceAmount ? p.yearlyPriceAmount : null;
            const buyable = interval === 'year' ? p.purchasableYearly : p.purchasable;
            return (
              <div key={p.key} className={cn('flex flex-col gap-3 rounded-lg border p-4', current ? 'border-accent-ink bg-accent-soft/40' : 'border-line')}>
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-[13px]">
                    {!p.priceAmount ? (
                      'Free'
                    ) : yearly ? (
                      <>
                        <strong className="text-base">{formatMoney(yearly, p.currency)}</strong> / year
                        {yearlySavingsPct(p.priceAmount, yearly) > 0 && <span className="ml-1.5 text-accent-ink">save {yearlySavingsPct(p.priceAmount, yearly)}%</span>}
                      </>
                    ) : (
                      <>
                        <strong className="text-base">{formatMoney(p.priceAmount, p.currency)}</strong> / month
                      </>
                    )}
                  </span>
                </div>
                {p.description && <p className="text-[13px] text-muted">{p.description}</p>}
                <ul className="flex flex-col gap-1 text-[13px]">
                  {p.entitlements.map((e) => (
                    <li key={e.key} className="flex items-center gap-1.5">
                      {e.enabled ? <Check className="size-3.5 text-accent-ink" /> : <Minus className="size-3.5 text-faint" />}
                      <span className={cn(!e.enabled && 'text-faint')}>
                        {e.enabled && e.limit !== null && e.key !== 'analytics_export' ? `${e.limit} ` : e.enabled && e.limit === null && e.key !== 'analytics_export' ? 'Unlimited ' : ''}
                        {e.label.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
                {current ? (
                  <Badge variant="success" className="self-start">
                    Current plan
                  </Badge>
                ) : (
                  canManage &&
                  p.priceAmount > 0 && (
                    <Button
                      variant="primary"
                      className="self-start"
                      disabled={!data.billingEnabled || !buyable || paid || awaiting}
                      loading={busy === p.key}
                      onClick={() => upgrade(p.key)}
                      title={!data.billingEnabled ? 'Available after the free beta' : !buyable && interval === 'year' ? 'Yearly billing isn’t available for this plan yet' : undefined}
                    >
                      {data.billingEnabled ? `Upgrade to ${p.name}` : 'Coming soon'}
                    </Button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </SettingsSection>

      {(data.invoices.length > 0 || data.payments.length > 0) && (
        <SettingsSection title="Payment history">
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Amount</TH>
                <TH>Status</TH>
                <TH>Method</TH>
              </TR>
            </THead>
            <TBody>
              {data.payments.map((p) => (
                <TR key={p.id}>
                  <TD>{new Date(p.createdAt).toLocaleDateString()}</TD>
                  <TD>{formatMoney(p.amount, p.currency)}</TD>
                  <TD>{p.status}</TD>
                  <TD>{p.method ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {data.invoices.length > 0 && (
            <ul className="mt-3 text-[13px]">
              {data.invoices.map((i) => (
                <li key={i.id}>
                  Invoice {new Date(i.issuedAt).toLocaleDateString()} · {formatMoney(i.amount, i.currency)} · {i.status}{' '}
                  {i.url && (
                    <a href={i.url} target="_blank" rel="noreferrer" className="text-info underline">
                      View
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SettingsSection>
      )}
    </div>
  );
}

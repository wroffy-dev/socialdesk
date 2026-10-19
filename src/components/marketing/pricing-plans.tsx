'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { bestYearlySavings, yearlySavingsPct, type BillingInterval } from '@/lib/pricing';
import { cn, formatMoney } from '@/lib/utils';
import type { listPublicPlans } from '@/server/services/billing';
import { Reveal, TiltCard } from './motion';

type Plan = Awaited<ReturnType<typeof listPublicPlans>>[number];

/** "1 team member", "5 projects", "Unlimited posts per month". */
function entitlementText(limit: number | null, label: string) {
  const text = label.toLowerCase();
  return limit === null ? `Unlimited ${text}` : `${limit} ${limit === 1 ? text.replace(/\b(member|workspace|project|post)s\b/, '$1') : text}`;
}

export function IntervalToggle({ value, onChange, savings, className }: { value: BillingInterval; onChange: (v: BillingInterval) => void; savings: number; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Billing period" className={cn('inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-card', className)}>
      {(['month', 'year'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn('flex items-center gap-2 rounded-full px-4 py-1.5 text-[14px] font-medium transition-colors', value === v ? 'bg-fg text-surface' : 'text-muted hover:text-fg')}
        >
          {v === 'month' ? 'Monthly' : 'Yearly'}
          {v === 'year' && savings > 0 && (
            <span className={cn('rounded-full px-1.5 py-0.5 text-2xs font-semibold', value === v ? 'bg-primary text-primary-fg' : 'bg-accent-soft text-accent-ink')}>Save up to {savings}%</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function PricingPlans({ plans, billing }: { plans: Plan[]; billing: boolean }) {
  const savings = bestYearlySavings(plans);
  const [interval, setInterval] = useState<BillingInterval>(savings > 0 ? 'year' : 'month');
  const highlight = plans.length >= 3 ? 2 : plans.length - 1;
  return (
    <>
      {savings > 0 && (
        <div className="mb-8 flex justify-center">
          <IntervalToggle value={interval} onChange={setInterval} savings={savings} />
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p, i) => {
          const featured = i === highlight;
          const yearly = interval === 'year' && p.yearlyPriceAmount ? p.yearlyPriceAmount : null;
          const pct = yearlySavingsPct(p.priceAmount, p.yearlyPriceAmount);
          return (
            <Reveal key={p.key} delay={i * 80}>
              <TiltCard strength={6} className={cn('flex flex-col rounded-2xl border bg-surface p-6', featured ? 'border-accent-ink shadow-[0_24px_60px_-20px_rgb(56_118_38/0.45)]' : 'border-line shadow-pop')}>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{p.name}</h2>
                  {featured && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-2xs font-semibold text-accent-ink">Most popular</span>}
                </div>
                <p className="mt-1 min-h-[40px] text-[13px] text-muted">{p.description}</p>
                <div className="mt-5 min-h-[64px]">
                  {!p.priceAmount ? (
                    <span className="text-4xl font-semibold tracking-tight">Free</span>
                  ) : yearly ? (
                    <>
                      <p>
                        <span className="text-4xl font-semibold tracking-tight">{formatMoney(Math.round(yearly / 12 / 100) * 100, p.currency)}</span>
                        <span className="text-muted"> / month</span>
                      </p>
                      <p className="mt-1 text-[12px] text-muted">
                        {formatMoney(yearly, p.currency)} billed yearly
                        {pct > 0 && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 font-semibold text-accent-ink">Save {pct}%</span>}
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        <span className="text-4xl font-semibold tracking-tight">{formatMoney(p.priceAmount, p.currency)}</span>
                        <span className="text-muted"> / month</span>
                      </p>
                      {interval === 'year' && <p className="mt-1 text-[12px] text-muted">Monthly billing only</p>}
                    </>
                  )}
                </div>
                <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-[14px]">
                  {p.entitlements.map((e) => (
                    <li key={e.key} className="flex items-center gap-2">
                      {e.enabled ? <Check className="size-4 shrink-0 text-accent-ink" /> : <Minus className="size-4 shrink-0 text-faint" />}
                      <span className={cn(!e.enabled && 'text-faint')}>{e.key === 'analytics_export' ? e.label : entitlementText(e.limit, e.label)}</span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-accent-ink" /> All 5 networks
                  </li>
                </ul>
                <Button asChild variant={featured ? 'primary' : 'outline'} size="lg" className="mt-7 rounded-full">
                  <Link href="/signup">{p.priceAmount && billing ? `Start with ${p.name}` : 'Get started'}</Link>
                </Button>
              </TiltCard>
            </Reveal>
          );
        })}
      </div>
    </>
  );
}

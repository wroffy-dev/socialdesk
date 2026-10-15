import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { listPublicPlans } from '@/server/services/billing';
import { Button } from '@/components/ui/button';
import { cn, formatMoney } from '@/lib/utils';

export const metadata = { title: 'Pricing' };
export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const plans = await listPublicPlans();
  const billing = process.env.BILLING_ENABLED === 'true';
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="text-center text-4xl font-semibold tracking-tight">Simple pricing</h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-lg text-muted">
        {billing ? 'Start free and upgrade when you need more projects or teammates. Each project links one account per platform: Instagram, Facebook, X, LinkedIn and YouTube.' : 'Everything is free during the beta. Paid plans will launch later with these limits.'}
      </p>
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p, i) => (
          <div key={p.key} className={cn('flex flex-col rounded-xl border bg-surface p-5', i === 2 ? 'border-accent-ink shadow-pop' : 'border-line')}>
            <h2 className="font-semibold">{p.name}</h2>
            <p className="mt-1 min-h-[40px] text-[13px] text-muted">{p.description}</p>
            <p className="mt-4">
              {p.priceAmount ? (
                <>
                  <span className="text-3xl font-semibold">{formatMoney(p.priceAmount, p.currency)}</span>
                  <span className="text-muted"> / {p.interval}</span>
                </>
              ) : (
                <span className="text-3xl font-semibold">Free</span>
              )}
            </p>
            <ul className="mt-5 flex flex-1 flex-col gap-2 text-[14px]">
              {p.entitlements.map((e) => (
                <li key={e.key} className="flex items-center gap-2">
                  {e.enabled ? <Check className="size-4 text-accent-ink" /> : <Minus className="size-4 text-faint" />}
                  <span className={cn(!e.enabled && 'text-faint')}>
                    {e.key === 'analytics_export' ? e.label : `${e.limit === null ? 'Unlimited' : e.limit} ${e.label.toLowerCase()}`}
                  </span>
                </li>
              ))}
            </ul>
            <Button asChild variant={i === 2 ? 'primary' : 'outline'} className="mt-6">
              <Link href="/signup">{p.priceAmount && billing ? `Start with ${p.name}` : 'Get started'}</Link>
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted">Prices in INR, billed monthly through Razorpay. Taxes may apply.</p>
    </section>
  );
}

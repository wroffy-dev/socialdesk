import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { listPublicPlans } from '@/server/services/billing';
import { Button } from '@/components/ui/button';
import { CtaBand, Faq, SectionHeading } from '@/components/marketing/sections';
import { Reveal, TiltCard } from '@/components/marketing/motion';
import { cn, formatMoney } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple monthly plans in INR. Start free, then upgrade for more projects, teammates and posts. Every plan includes Instagram, Facebook, X, LinkedIn and YouTube.',
};
export const dynamic = 'force-dynamic';

const PRICING_FAQ = [
  { q: 'What is a project?', a: 'A project is one brand or client. Each project can link one account per network: one Instagram, one Facebook Page, one X, one LinkedIn and one YouTube channel.' },
  { q: 'Do all plans include every network?', a: 'Yes. Every plan, including Free, can publish to Instagram, Facebook, X, LinkedIn and YouTube. Plans differ in projects, teammates, monthly posts and analytics.' },
  { q: 'Can I change plans later?', a: 'Yes. Upgrade whenever you need more, and the new limits apply straight away. You can move back to Free at any time.' },
  { q: 'How do I pay?', a: 'Paid plans are billed monthly in INR through Razorpay. Taxes may apply.' },
];

/** "1 team member", "5 projects", "Unlimited posts per month". */
function entitlementText(limit: number | null, label: string) {
  const text = label.toLowerCase();
  return limit === null ? `Unlimited ${text}` : `${limit} ${limit === 1 ? text.replace(/\b(member|workspace|project|post)s\b/, '$1') : text}`;
}

export default async function PricingPage() {
  const plans = await listPublicPlans();
  const billing = process.env.BILLING_ENABLED === 'true';
  const highlight = plans.length >= 3 ? 2 : plans.length - 1;
  return (
    <>
      <section className="px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="relative isolate overflow-hidden rounded-[28px] bg-[#0c110d] text-white">
          <div className="sd-grid-bg absolute inset-0 -z-10" />
          <div className="sd-aurora absolute -left-24 -top-40 -z-10 size-[520px] rounded-full bg-[#7ed957]/25 blur-[120px]" />
          <div className="sd-aurora absolute -right-32 top-10 -z-10 size-[480px] rounded-full bg-[#8b5cf6]/25 blur-[120px] [animation-delay:-6s]" />
          <div className="mx-auto max-w-3xl px-5 pb-40 pt-20 text-center sm:pt-24">
            <Reveal>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[#b8e4a3]">Pricing</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">
                Simple, <span className="sd-shine-text">honest pricing</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-lg text-white/65">
                {billing
                  ? 'Start free and upgrade when you need more projects or teammates. Every plan includes all five networks.'
                  : 'Everything is free during the beta. Paid plans will launch later with these limits.'}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-28 max-w-6xl px-4 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p, i) => {
            const featured = i === highlight;
            return (
              <Reveal key={p.key} delay={i * 80}>
                <TiltCard strength={6} className={cn('flex flex-col rounded-2xl border bg-surface p-6', featured ? 'border-accent-ink shadow-[0_24px_60px_-20px_rgb(56_118_38/0.45)]' : 'border-line shadow-pop')}>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{p.name}</h2>
                    {featured && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-2xs font-semibold text-accent-ink">Most popular</span>}
                  </div>
                  <p className="mt-1 min-h-[40px] text-[13px] text-muted">{p.description}</p>
                  <p className="mt-5">
                    {p.priceAmount ? (
                      <>
                        <span className="text-4xl font-semibold tracking-tight">{formatMoney(p.priceAmount, p.currency)}</span>
                        <span className="text-muted"> / {p.interval}</span>
                      </>
                    ) : (
                      <span className="text-4xl font-semibold tracking-tight">Free</span>
                    )}
                  </p>
                  <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-[14px]">
                    {p.entitlements.map((e) => (
                      <li key={e.key} className="flex items-center gap-2">
                        {e.enabled ? <Check className="size-4 shrink-0 text-accent-ink" /> : <Minus className="size-4 shrink-0 text-faint" />}
                        <span className={cn(!e.enabled && 'text-faint')}>
                          {e.key === 'analytics_export' ? e.label : entitlementText(e.limit, e.label)}
                        </span>
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
        <p className="mt-6 text-center text-xs text-muted">Prices in INR, billed monthly through Razorpay. Taxes may apply.</p>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
        <Reveal>
          <SectionHeading center eyebrow="FAQ" title="Pricing questions" />
        </Reveal>
        <Reveal delay={100} className="mt-10">
          <Faq items={PRICING_FAQ} />
        </Reveal>
      </section>

      <CtaBand />
    </>
  );
}

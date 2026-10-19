import type { Metadata } from 'next';
import { listPublicPlans } from '@/server/services/billing';
import { CtaBand, Faq, SectionHeading } from '@/components/marketing/sections';
import { Reveal } from '@/components/marketing/motion';
import { PricingPlans } from '@/components/marketing/pricing-plans';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple monthly and yearly plans in INR. Start free, then upgrade for more projects, teammates and posts. Every plan includes Instagram, Facebook, X, LinkedIn and YouTube.',
};
export const dynamic = 'force-dynamic';

const PRICING_FAQ = [
  { q: 'What is a project?', a: 'A project is one brand or client. Each project can link one account per network: one Instagram, one Facebook Page, one X, one LinkedIn and one YouTube channel.' },
  { q: 'Do all plans include every network?', a: 'Yes. Every plan, including Free, can publish to Instagram, Facebook, X, LinkedIn and YouTube. Plans differ in projects, teammates, monthly posts and analytics.' },
  { q: 'Can I change plans later?', a: 'Yes. Upgrade whenever you need more, and the new limits apply straight away. You can move back to Free at any time.' },
  { q: 'How do I pay?', a: 'Paid plans are billed in INR through Razorpay, monthly or once a year. Taxes may apply.' },
  { q: 'Is yearly billing cheaper?', a: 'Yes. Paying for a year up front costs less than twelve monthly payments; each plan shows the exact saving. Yearly plans renew once a year and can be cancelled before renewal.' },
];

export default async function PricingPage() {
  const plans = await listPublicPlans();
  const billing = process.env.BILLING_ENABLED === 'true';
  return (
    <>
      <section className="px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="relative isolate overflow-hidden rounded-[28px] bg-[#0c110d] dark:ring-1 dark:ring-white/10 text-white">
          <div className="sd-grid-bg absolute inset-0 -z-10" />
          <div className="sd-aurora absolute -left-24 -top-40 -z-10 size-[520px] rounded-full bg-[#7ed957]/25 blur-[120px]" />
          <div className="sd-aurora absolute -right-32 top-10 -z-10 size-[480px] rounded-full bg-[#8b5cf6]/25 blur-[120px] [animation-delay:-6s]" />
          <div className="mx-auto max-w-3xl px-5 pb-52 pt-20 text-center sm:pt-24">
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

      <section className="relative z-10 mx-auto -mt-40 max-w-6xl px-4 sm:px-6">
        <PricingPlans plans={plans} billing={billing} />
        <p className="mt-6 text-center text-xs text-muted">Prices in INR, billed monthly or yearly through Razorpay. Taxes may apply.</p>
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

import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FAQS } from './feature-list';

export function SectionHeading({ eyebrow, title, intro, center, className }: { eyebrow?: string; title: string; intro?: string; center?: boolean; className?: string }) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center', className)}>
      {eyebrow && <p className="text-[13px] font-semibold uppercase tracking-wide text-accent-ink">{eyebrow}</p>}
      <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[34px] sm:leading-tight">{title}</h2>
      {intro && <p className="mt-3 text-[17px] leading-relaxed text-muted">{intro}</p>}
    </div>
  );
}

export function Faq({ items = FAQS }: { items?: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {items.map((f) => (
        <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-4 font-medium">
            {f.q}
            <ChevronDown className="ml-auto size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({ title = 'Start planning your next month of content', body = 'Create a workspace, connect your accounts and schedule your first post in minutes.' }: { title?: string; body?: string }) {
  return (
    <section className="px-2 pb-3 sm:px-3">
      <div className="relative isolate mx-auto overflow-hidden rounded-[28px] bg-[#0c110d] px-6 py-20 text-center text-white sm:px-12">
        <div className="sd-grid-bg absolute inset-0 -z-10" />
        <div className="sd-aurora absolute -left-24 -top-32 -z-10 size-[460px] rounded-full bg-[#7ed957]/25 blur-[110px]" />
        <div className="sd-aurora absolute -bottom-40 -right-24 -z-10 size-[460px] rounded-full bg-[#8b5cf6]/25 blur-[110px] [animation-delay:-7s]" />
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl sm:leading-tight">{title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-[17px] text-white/65">{body}</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button asChild variant="primary" size="lg" className="h-12 rounded-full px-7 text-[15px] shadow-[0_0_40px_-8px_rgb(184_228_163/0.8)]">
            <Link href="/signup">
              Create your free account <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" className="h-12 rounded-full border border-white/15 bg-white/5 px-7 text-[15px] text-white backdrop-blur hover:bg-white/10">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

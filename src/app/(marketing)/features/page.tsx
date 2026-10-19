import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { FEATURE_GROUPS, PLATFORM_MATRIX } from '@/components/marketing/feature-list';
import { CtaBand, SectionHeading } from '@/components/marketing/sections';
import { Reveal, TiltCard } from '@/components/marketing/motion';
import { PlatformIcon } from '@/components/platform-icon';
import { COMING_SOON, PLATFORMS, PLATFORM_INFO } from '@/lib/platforms';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Composer with per-network versions, drag-and-drop calendar, posting queue, best time to post, Instagram Reels, Stories and collaborators, comments inbox, insights, projects and team roles.',
};

export default function FeaturesPage() {
  return (
    <>
      <section className="px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="relative isolate overflow-hidden rounded-[28px] bg-[#0c110d] text-white">
          <div className="sd-grid-bg absolute inset-0 -z-10" />
          <div className="sd-aurora absolute -left-24 -top-40 -z-10 size-[520px] rounded-full bg-[#7ed957]/25 blur-[120px]" />
          <div className="sd-aurora absolute -right-32 top-10 -z-10 size-[480px] rounded-full bg-[#8b5cf6]/25 blur-[120px] [animation-delay:-6s]" />
          <div className="mx-auto max-w-4xl px-5 py-20 text-center sm:py-28">
            <Reveal>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[#b8e4a3]">Features</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl sm:leading-[1.05]">
                Everything you need to <span className="sd-shine-text">publish with confidence</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-white/65">From the first draft to the last reply: create, schedule, engage and learn, for every brand you manage.</p>
            </Reveal>
            <Reveal delay={150}>
              <nav className="mt-9 flex flex-wrap justify-center gap-2 text-[13px]">
                {FEATURE_GROUPS.map((g) => (
                  <a key={g.id} href={`#${g.id}`} className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white">
                    {g.eyebrow}
                  </a>
                ))}
                <a href="#channels" className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white">
                  Channels
                </a>
              </nav>
            </Reveal>
          </div>
        </div>
      </section>

      {FEATURE_GROUPS.map((g, gi) => (
        <section key={g.id} id={g.id} className={cn('scroll-mt-16', gi % 2 === 1 && 'bg-surface')}>
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal>
              <SectionHeading eyebrow={g.eyebrow} title={g.title} intro={g.intro} />
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {g.items.map((f, i) => (
                <Reveal key={f.title} delay={i * 80}>
                  <TiltCard className={cn('rounded-2xl border border-line p-6 shadow-card', gi % 2 === 1 ? 'bg-canvas/60' : 'bg-surface')}>
                    <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#d9f2cc] to-[#b8e4a3] text-accent-ink">
                      <f.icon className="size-5" />
                    </span>
                    <h3 className="mt-4 font-semibold">{f.title}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{f.body}</p>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section id="channels" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20 sm:px-6">
        <Reveal>
          <SectionHeading eyebrow="Channels" title="What each network supports" intro="We only offer what each platform’s official API allows, and say so plainly where something isn’t possible." />
        </Reveal>
        <Reveal delay={100} className="mt-10 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[720px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-line">
                <th className="p-4 font-medium text-muted" />
                {PLATFORMS.map((p) => (
                  <th key={p} className="p-4 font-semibold">
                    <span className="flex items-center gap-2">
                      <PlatformIcon platform={p} size={18} /> {PLATFORM_INFO[p].label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLATFORM_MATRIX.map((row) => (
                <tr key={row.label} className="border-b border-line last:border-0">
                  <th className="p-4 align-top font-medium">{row.label}</th>
                  {PLATFORMS.map((p) => {
                    const v = row.values[p];
                    return (
                      <td key={p} className="p-4 align-top text-[13px]">
                        {v === true ? <Check className="size-4 text-accent-ink" aria-label="Yes" /> : v === false ? <Minus className="size-4 text-faint" aria-label="No" /> : <span className="text-muted">{v}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
        <p className="mt-4 text-[13px] text-muted">
          Coming next: {COMING_SOON.map((p) => p.label).join(', ')}. Instagram publishing needs a professional (Business or Creator) account linked to a Facebook Page.{' '}
          <Link href="/#faq" className="text-info hover:underline">
            Read the FAQ
          </Link>
        </p>
      </section>

      <CtaBand />
    </>
  );
}

/* eslint-disable @next/next/no-img-element -- admin-provided external images; next/image would need every host whitelisted */
import type { PublicSocialProof } from '@/server/services/social-proof';
import { cn } from '@/lib/utils';
import { Reveal, TiltCard } from './motion';
import { SectionHeading } from './sections';

/** "Trusted by" logo strip. Renders nothing until at least one logo is published. */
export function LogoStrip({ logos }: { logos: PublicSocialProof['logos'] }) {
  if (!logos.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6" aria-label="Customers">
      <p className="text-center text-[13px] font-medium uppercase tracking-wide text-muted">Trusted by teams at</p>
      <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
        {logos.map((l) => {
          const mark = l.imageUrl ? (
            <img src={l.imageUrl} alt={l.name} loading="lazy" className="h-7 w-auto max-w-[140px] object-contain opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0 dark:invert" />
          ) : (
            <span className="text-lg font-semibold tracking-tight text-muted transition hover:text-fg">{l.name}</span>
          );
          return (
            <li key={l.id}>
              {l.websiteUrl ? (
                <a href={l.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" title={l.name}>
                  {mark}
                </a>
              ) : (
                mark
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Customer quotes. Renders nothing until at least one testimonial is published. */
export function Testimonials({ items }: { items: PublicSocialProof['testimonials'] }) {
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <Reveal>
        <SectionHeading center eyebrow="Customers" title="What our customers say" />
      </Reveal>
      <div className={cn('mt-12 gap-4', items.length === 1 ? 'mx-auto max-w-xl' : items.length === 2 ? 'mx-auto max-w-4xl columns-1 sm:columns-2' : 'columns-1 sm:columns-2 lg:columns-3')}>
        {items.map((t, i) => (
          <Reveal key={t.id} delay={(i % 3) * 80} className="mb-4 break-inside-avoid">
            <TiltCard strength={5} className="rounded-2xl border border-line bg-surface p-6 shadow-card">
              <figure>
                <blockquote className="text-[15px] leading-relaxed text-fg/90">“{t.quote}”</blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  {t.avatarUrl ? (
                    <img src={t.avatarUrl} alt="" loading="lazy" className="size-10 rounded-full object-cover" />
                  ) : (
                    <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink">{t.authorName.slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="text-[13px] leading-tight">
                    <span className="block font-semibold">{t.authorName}</span>
                    {(t.authorRole || t.company) && <span className="text-muted">{[t.authorRole, t.company].filter(Boolean).join(', ')}</span>}
                  </span>
                </figcaption>
              </figure>
            </TiltCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

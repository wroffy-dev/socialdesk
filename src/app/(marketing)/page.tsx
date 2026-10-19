import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Check, CheckCircle2 } from 'lucide-react';
import { getCurrentUser } from '@/server/auth/session';
import { Button } from '@/components/ui/button';
import { PlatformIcon } from '@/components/platform-icon';
import { PLATFORMS, PLATFORM_INFO } from '@/lib/platforms';
import { FEATURES, INSTAGRAM_FEATURES, STORY, TRUST_POINTS } from '@/components/marketing/feature-list';
import { ScrollStory } from '@/components/marketing/scroll-story';
import { LogoStrip, Testimonials } from '@/components/marketing/social-proof';
import { publishedSocialProof } from '@/server/services/social-proof';
import { BestTimeMock, HeroPreview, InboxMock, InstagramMock, ProjectsMock } from '@/components/marketing/mocks';
import { CtaBand, Faq, SectionHeading } from '@/components/marketing/sections';
import { HeroScene } from '@/components/marketing/hero-scene';
import { Reveal, ScrollTilt, TiltCard } from '@/components/marketing/motion';

export const metadata: Metadata = {
  title: { absolute: 'SocialDesk: schedule Instagram, Facebook, X, LinkedIn and YouTube posts' },
  description:
    'Plan, schedule and publish to Instagram, Facebook, X, LinkedIn and YouTube from one calendar. Reels, Stories, collaborators, first comment, best time to post and a shared comments inbox for teams and agencies.',
  openGraph: {
    title: 'SocialDesk: social media scheduling for teams and agencies',
    description: 'One calendar for Instagram, Facebook, X, LinkedIn and YouTube. Schedule, publish, reply and learn what works.',
    type: 'website',
  },
};

const MARQUEE = ['Reels', 'Stories', 'Carousels', 'Collaborators', 'First comment', 'Best time to post', 'Posting queue', 'Comments inbox', 'YouTube Shorts', 'LinkedIn pages', 'Team roles', 'Insights'];

export default async function Landing() {
  if (await getCurrentUser()) redirect('/app');
  const billing = process.env.BILLING_ENABLED === 'true';
  const proof = await publishedSocialProof();
  return (
    <>
      {/* Hero: dark stage with the 3D scene */}
      <section className="px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="relative isolate overflow-hidden rounded-[28px] bg-[#0c110d] dark:ring-1 dark:ring-white/10 text-white">
          <div className="sd-grid-bg absolute inset-0 -z-10" />
          <div className="sd-aurora absolute -left-32 -top-40 -z-10 size-[560px] rounded-full bg-[#7ed957]/25 blur-[120px]" />
          <div className="sd-aurora absolute -right-40 top-20 -z-10 size-[520px] rounded-full bg-[#8b5cf6]/25 blur-[120px] [animation-delay:-6s]" />
          <div className="mx-auto grid max-w-6xl items-center gap-4 px-5 pb-36 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-44">
            <div className="relative z-10 text-center lg:text-left">
              <Reveal>
                <span className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[13px] text-white/75 backdrop-blur">
                  <span className="flex -space-x-1">
                    {PLATFORMS.map((p) => (
                      <PlatformIcon key={p} platform={p} size={16} className="ring-2 ring-[#0c110d]" />
                    ))}
                  </span>
                  Instagram, Facebook, X, LinkedIn & YouTube
                </span>
              </Reveal>
              <Reveal delay={80}>
                <h1 className="mt-6 text-[40px] font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-[68px]">
                  Your social media,
                  <br />
                  <span className="sd-shine-text">on autopilot.</span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/65 lg:mx-0">
                  Plan, schedule and publish to every network from one calendar. Reels, Stories, collabs and first comments included. Built for creators, teams and agencies.
                </p>
              </Reveal>
              <Reveal delay={240}>
                <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
                  <Button asChild variant="primary" size="lg" className="h-12 rounded-full px-7 text-[15px] shadow-[0_0_40px_-8px_rgb(184_228_163/0.8)]">
                    <Link href="/signup">
                      Start free <ArrowRight />
                    </Link>
                  </Button>
                  <Button asChild size="lg" className="h-12 rounded-full border border-white/15 bg-white/5 px-7 text-[15px] text-white backdrop-blur hover:bg-white/10">
                    <Link href="/features">Explore features</Link>
                  </Button>
                </div>
              </Reveal>
              <Reveal delay={320}>
                <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px] text-white/55 lg:justify-start">
                  {[billing ? 'Free plan forever' : 'Free during beta', 'No card required', 'Official platform APIs only'].map((t) => (
                    <li key={t} className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-4 text-[#b8e4a3]" /> {t}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <HeroScene className="h-[340px] w-full sm:h-[420px] lg:h-[540px]" />
          </div>
        </div>
      </section>

      {/* Product preview, rising out of the hero */}
      <section className="relative z-10 -mt-28 px-4 sm:px-6 lg:-mt-36">
        <ScrollTilt>
          <div className="relative mx-auto max-w-5xl">
            <div className="absolute -inset-6 -z-10 rounded-[36px] bg-gradient-to-r from-[#b8e4a3]/40 via-[#a78bfa]/30 to-[#38bdf8]/30 blur-2xl" />
            <HeroPreview />
          </div>
        </ScrollTilt>
      </section>

      {/* Marquee */}
      <section className="mt-16 overflow-hidden border-y border-line bg-surface py-4" aria-label="Highlights">
        <div className="sd-marquee flex w-max gap-3">
          {[...MARQUEE, ...MARQUEE].map((m, i) => (
            <span key={i} className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-canvas px-4 py-1.5 text-[13px] text-muted">
              <span className="size-1.5 rounded-full bg-accent-ink" /> {m}
            </span>
          ))}
        </div>
      </section>

      <LogoStrip logos={proof.logos} />

      {/* Scroll story: one object, five shapes */}
      <section className="px-2 pt-16 sm:px-3">
        <div className="relative isolate rounded-[28px] bg-[#0c110d] text-white dark:ring-1 dark:ring-white/10">
          <div className="sd-grid-bg absolute inset-0 -z-10 rounded-[28px]" />
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-20 sm:px-8">
            <Reveal>
              <p className="text-center text-[13px] font-semibold uppercase tracking-wide text-[#b8e4a3]">How it works</p>
              <h2 className="mx-auto mt-2 max-w-2xl text-center text-3xl font-semibold tracking-tight sm:text-[44px] sm:leading-tight">
                From idea to insight, <span className="sd-shine-text">in one flow</span>
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-center text-[17px] text-white/60">Scroll to follow a post through SocialDesk.</p>
            </Reveal>
            <div className="mt-6">
              <ScrollStory steps={STORY} />
            </div>
          </div>
        </div>
      </section>

      {/* Feature grid (dark) */}
      <section className="px-2 pt-3 sm:px-3">
        <div className="relative isolate overflow-hidden rounded-[28px] bg-[#0c110d] dark:ring-1 dark:ring-white/10 text-white">
          <div className="sd-grid-bg absolute inset-0 -z-10" />
          <div className="sd-aurora absolute -bottom-40 left-1/3 -z-10 size-[520px] rounded-full bg-[#7ed957]/15 blur-[120px]" />
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
            <Reveal>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[#b8e4a3]">Everything in one place</p>
              <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-[40px] sm:leading-tight">The essentials, done properly.</h2>
              <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-white/60">SocialDesk focuses on what you use every day and makes it dependable.</p>
            </Reveal>
            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 4) * 80}>
                  <TiltCard className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#b8e4a3] to-[#6fbf4f] text-[#13210d] shadow-[0_8px_24px_-8px_rgb(126_217_87/0.7)]">
                      <f.icon className="size-5" />
                    </span>
                    <h3 className="mt-4 font-semibold">{f.title}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-white/60">{f.body}</p>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Instagram */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <SectionHeading
            eyebrow="Instagram, fully supported"
            title="Reels, Stories, carousels and collabs"
            intro="Publish every Instagram format the official API allows, with the extras that make posts perform: collaborators, people tags and an automatic first comment."
          />
          <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {INSTAGRAM_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[15px]">
                <Check className="mt-0.5 size-4 shrink-0 text-accent-ink" /> {f}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120} className="relative isolate">
          <div className="absolute left-1/2 top-1/2 -z-10 size-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#f9a825]/40 via-[#e1306c]/30 to-[#833ab4]/40 blur-3xl" />
          <div className="sd-float [--float-rot:-3deg]">
            <InstagramMock />
          </div>
        </Reveal>
      </section>

      {/* Best time */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <Reveal className="order-2 lg:order-1">
            <TiltCard strength={6} className="rounded-2xl">
              <BestTimeMock />
            </TiltCard>
          </Reveal>
          <Reveal delay={120} className="order-1 lg:order-2">
            <SectionHeading
              eyebrow="Best time to post"
              title="Post when your audience is actually there"
              intro="SocialDesk studies your own published posts, compares each one with your typical result, and shows the weekday and hour that work best in your timezone."
            />
            <ul className="mt-6 space-y-2.5 text-[15px]">
              {['Based on your results, not generic industry charts', 'Fair across big and small accounts', 'Add the top times to your posting queue in one click'].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent-ink" /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Inbox */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <SectionHeading
            eyebrow="Community"
            title="Every comment in one inbox"
            intro="Reply to Instagram, Facebook and YouTube comments without switching apps. Assign conversations, keep internal notes and answer common questions with saved replies."
          />
          <Button asChild variant="outline" className="mt-6 rounded-full">
            <Link href="/features#engage">
              More about the inbox <ArrowRight />
            </Link>
          </Button>
        </Reveal>
        <Reveal delay={120}>
          <TiltCard strength={6} className="rounded-2xl">
            <InboxMock />
          </TiltCard>
        </Reveal>
      </section>

      {/* Agencies */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <Reveal className="order-2 lg:order-1">
            <TiltCard strength={6} className="rounded-2xl">
              <ProjectsMock />
            </TiltCard>
          </Reveal>
          <Reveal delay={120} className="order-1 lg:order-2">
            <SectionHeading
              eyebrow="For agencies and growing teams"
              title="One workspace, every client kept separate"
              intro="Give each brand its own project with its own accounts, so a post can never go to the wrong page. Invite your team and clients with just the access they need."
            />
            <ul className="mt-6 space-y-2.5 text-[15px]">
              {['Admins manage channels and settings', 'Publishers create and schedule posts', 'Analysts see insights, nothing else', 'Every change recorded in the audit log'].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent-ink" /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Channels */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <Reveal>
          <SectionHeading center eyebrow="Channels" title="Connect the networks that matter to you" />
        </Reveal>
        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PLATFORMS.map((p, i) => (
            <Reveal key={p} delay={i * 70}>
              <TiltCard strength={14} className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-8 text-center shadow-card">
                <span className="sd-float" style={{ animationDelay: `${-i * 1.1}s` }}>
                  <PlatformIcon platform={p} size={48} className="shadow-pop" />
                </span>
                <p className="font-medium">{PLATFORM_INFO[p].label}</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>
        <p className="mt-5 text-center text-[13px] text-muted">Threads, Bluesky and Pinterest are coming next.</p>
      </section>

      {/* Trust */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <Reveal>
            <SectionHeading center eyebrow="Trust" title="Publishing you can rely on" intro="Your brand’s reputation depends on every post going out once, on time, exactly as written." />
          </Reveal>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_POINTS.map((t, i) => (
              <Reveal key={t.title} delay={i * 80}>
                <TiltCard className="rounded-2xl border border-line bg-canvas/60 p-6">
                  <t.icon className="size-5 text-accent-ink" />
                  <h3 className="mt-3 font-semibold">{t.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{t.body}</p>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Testimonials items={proof.testimonials} />

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-24 sm:px-6">
        <Reveal>
          <SectionHeading center eyebrow="FAQ" title="Questions, answered" />
        </Reveal>
        <Reveal delay={100} className="mt-10">
          <Faq />
        </Reveal>
      </section>

      <CtaBand />
    </>
  );
}

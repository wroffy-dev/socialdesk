import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { getCurrentUser } from '@/server/auth/session';
import { Button } from '@/components/ui/button';
import { PlatformIcon } from '@/components/platform-icon';
import { FEATURES } from '@/components/marketing/feature-list';

export default async function Landing() {
  if (await getCurrentUser()) redirect('/app');
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-muted">
            <PlatformIcon platform="INSTAGRAM" size={16} /> <PlatformIcon platform="FACEBOOK" size={16} /> Instagram & Facebook publishing
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">Plan, schedule and publish your social media in one calm place.</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">A clean calendar, a queue that fills itself, and publishing you can trust. Built for small teams and agencies.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild variant="primary" size="lg">
              <Link href="/signup">
                Start free <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/features">See features</Link>
            </Button>
          </div>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px] text-muted">
            {['Free during beta', 'No card required', 'Official Meta APIs only'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-accent-ink" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-x-8 gap-y-10 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {FEATURES.slice(0, 4).map((f) => (
            <div key={f.title}>
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-[14px] text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <h2 className="text-2xl font-semibold">Ready when you are</h2>
        <p className="mt-2 text-muted">Create a workspace, connect your Instagram professional account or Facebook Page, and schedule your first post in minutes.</p>
        <Button asChild variant="primary" size="lg" className="mt-6">
          <Link href="/signup">Create your free account</Link>
        </Button>
      </section>
    </>
  );
}

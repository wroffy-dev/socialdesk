import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FEATURES } from '@/components/marketing/feature-list';
import { COMING_SOON } from '@/lib/platforms';

export const metadata = { title: 'Features' };

export default function FeaturesPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="text-center text-4xl font-semibold tracking-tight">Everything you need to publish with confidence</h1>
      <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted">SocialDesk focuses on the essentials and does them reliably.</p>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-line bg-surface p-5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
              <f.icon className="size-5" />
            </span>
            <h3 className="mt-3 font-semibold">{f.title}</h3>
            <p className="mt-1 text-[14px] text-muted">{f.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-12 rounded-xl border border-line bg-surface p-6 text-center">
        <h2 className="text-lg font-semibold">Supported channels</h2>
        <p className="mt-1 text-[14px] text-muted">
          Instagram professional accounts and Facebook Pages today. Coming next: {COMING_SOON.map((p) => p.label).join(', ')}.
        </p>
        <Button asChild variant="primary" className="mt-4">
          <Link href="/signup">Get started free</Link>
        </Button>
      </div>
    </section>
  );
}

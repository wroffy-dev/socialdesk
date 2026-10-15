'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConnectDialog } from '@/components/channels/connect-dialog';
import { cn } from '@/lib/utils';

/** First-run guide shown until the workspace has a channel and a post. */
export function OnboardingChecklist({
  emailVerified,
  hasChannels,
  hasPosts,
  canManageChannels,
  canCreate,
  base,
}: {
  emailVerified: boolean;
  hasChannels: boolean;
  hasPosts: boolean;
  canManageChannels: boolean;
  canCreate: boolean;
  base: string;
}) {
  const connect = useConnectDialog();
  const steps = [
    { done: emailVerified, title: 'Verify your email', body: 'Use the link we sent you. Needed before connecting channels or publishing.' },
    {
      done: hasChannels,
      title: 'Connect a channel',
      body: 'Add Instagram, Facebook, X, LinkedIn or YouTube to a project.',
      action: canManageChannels && (
        <Button size="sm" variant="primary" onClick={connect.open} disabled={!emailVerified}>
          Connect
        </Button>
      ),
    },
    {
      done: hasPosts,
      title: 'Create your first post',
      body: 'Write once, then tailor the caption and media for each platform.',
      action: canCreate && (
        <Button size="sm" asChild variant={hasChannels ? 'primary' : 'outline'}>
          <Link href={`${base}/compose`}>Create post</Link>
        </Button>
      ),
    },
    {
      done: false,
      optional: true,
      title: 'Set your posting times',
      body: 'Queue slots let you add posts without picking a time.',
      action: (
        <Button size="sm" asChild variant="ghost">
          <Link href={`${base}/publish/queue`}>Queue settings</Link>
        </Button>
      ),
    },
  ];
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="rounded-xl border border-line bg-subtle p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">Get set up</h2>
          <p className="text-[13px] text-muted">{done} of 3 steps done</p>
        </div>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent-ink transition-all" style={{ width: `${(Math.min(done, 3) / 3) * 100}%` }} />
        </div>
      </div>
      <ol className="mt-4 flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-center gap-3">
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                s.done ? 'border-accent-ink bg-primary text-primary-fg' : s.optional ? 'border-dashed border-line-strong text-faint' : 'border-line-strong bg-surface',
              )}
            >
              {s.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-[14px] font-medium', s.done && 'text-muted line-through')}>
                {s.title}
                {s.optional && <span className="ml-1.5 text-xs font-normal text-faint">optional</span>}
              </p>
              <p className="text-[13px] text-muted">{s.body}</p>
            </div>
            {!s.done && s.action}
          </li>
        ))}
      </ol>
    </section>
  );
}

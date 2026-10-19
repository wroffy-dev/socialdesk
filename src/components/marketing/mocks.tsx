/**
 * Illustrative product previews for the marketing pages, drawn with plain markup so they stay
 * sharp at any size and always match the app's styling. The names and numbers are sample data.
 */
import { Check, CheckCircle2, CornerDownRight, Send, Sparkles, UserPlus } from 'lucide-react';
import { PlatformIcon } from '@/components/platform-icon';
import { PLATFORMS, type Platform } from '@/lib/platforms';
import { cn } from '@/lib/utils';

function Frame({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-line bg-surface shadow-pop', className)} aria-hidden>
      <div className="flex items-center gap-1.5 border-b border-line bg-subtle px-3 py-2">
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="size-2.5 rounded-full bg-line-strong" />
        {title && <span className="ml-2 text-2xs text-muted">{title}</span>}
      </div>
      {children}
    </div>
  );
}

const WEEK: { day: string; posts: { p: Platform; t: string; label: string }[] }[] = [
  { day: 'Mon', posts: [{ p: 'INSTAGRAM', t: '9:00', label: 'Monsoon menu' }] },
  { day: 'Tue', posts: [{ p: 'LINKEDIN', t: '10:30', label: 'Hiring post' }, { p: 'X', t: '18:00', label: 'Poll' }] },
  { day: 'Wed', posts: [{ p: 'YOUTUBE', t: '17:00', label: 'Recipe Short' }] },
  { day: 'Thu', posts: [{ p: 'INSTAGRAM', t: '19:00', label: 'Reel: behind…' }, { p: 'FACEBOOK', t: '19:00', label: 'Offer' }] },
  { day: 'Fri', posts: [{ p: 'INSTAGRAM', t: '12:00', label: 'Story' }] },
  { day: 'Sat', posts: [{ p: 'FACEBOOK', t: '11:00', label: 'Weekend deal' }] },
  { day: 'Sun', posts: [] },
];

/** Hero: a week calendar next to the composer. */
export function HeroPreview() {
  return (
    <Frame title="SocialDesk · Publish" className="mx-auto max-w-5xl">
      <div className="grid md:grid-cols-[1.35fr_1fr]">
        <div className="hidden flex-col border-r border-line p-4 md:flex">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">This week</p>
            <span className="rounded-md bg-accent-soft px-2 py-0.5 text-2xs font-medium text-accent-ink">8 scheduled</span>
          </div>
          <div className="grid flex-1 grid-cols-7 gap-1.5">
            {WEEK.map((d) => (
              <div key={d.day} className="min-h-[148px] rounded-lg border border-line bg-canvas/60 p-1.5 [background-image:repeating-linear-gradient(to_bottom,transparent_0,transparent_47px,rgb(var(--line))_47px,rgb(var(--line))_48px)]">
                <p className="mb-1.5 text-2xs font-medium text-muted">{d.day}</p>
                <div className="flex flex-col gap-1">
                  {d.posts.map((x) => (
                    <div key={x.label} className="rounded-md border border-line bg-surface p-1 shadow-card">
                      <div className="flex items-center gap-1">
                        <PlatformIcon platform={x.p} size={11} />
                        <span className="text-[9px] tabular-nums text-muted">{x.t}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] leading-tight">{x.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4">
          <p className="text-[13px] font-semibold">New post</p>
          <div className="mt-3 flex gap-1.5">
            {PLATFORMS.map((p, i) => (
              <span key={p} className={cn('rounded-lg border p-1', i < 3 ? 'border-accent-ink/40 bg-accent-soft' : 'border-line opacity-50')}>
                <PlatformIcon platform={p} size={18} />
              </span>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-line p-3 text-[13px] leading-relaxed">
            Our monsoon menu is here ☔ Hot chai, fresh pakoras and 3 new combos. Which one are you trying first?
            <p className="mt-1.5 text-info">#monsoon #chai #foodie</p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {['from-amber-200 to-orange-300', 'from-lime-200 to-emerald-300', 'from-rose-200 to-pink-300'].map((g) => (
              <div key={g} className={cn('aspect-square rounded-md bg-gradient-to-br', g)} />
            ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-[12px]">
            {[
              ['INSTAGRAM', 'Carousel · 3 images · first comment'],
              ['FACEBOOK', 'Page post · 3 photos'],
              ['X', '112 / 280 characters'],
            ].map(([p, t]) => (
              <li key={p} className="flex items-center gap-2">
                <PlatformIcon platform={p as Platform} size={14} />
                <span className="text-muted">{t}</span>
                <CheckCircle2 className="ml-auto size-3.5 text-accent-ink" />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-2">
            <span className="flex-1 rounded-md border border-line px-2.5 py-1.5 text-[12px] text-muted">Thu, 19:00 · Asia/Kolkata</span>
            <span className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-fg">Schedule</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = [8, 10, 12, 14, 16, 18, 20, 22];
/** Deterministic sample scores (0–4) for the heatmap. */
const SCORES = [
  [1, 2, 2, 1, 1, 2, 3, 1],
  [1, 2, 3, 1, 1, 2, 3, 2],
  [0, 1, 2, 1, 2, 3, 3, 1],
  [1, 1, 2, 1, 2, 3, 4, 2],
  [0, 1, 3, 1, 1, 2, 3, 2],
  [0, 1, 2, 2, 2, 3, 3, 3],
  [0, 0, 1, 2, 2, 3, 4, 2],
];
const SHADE = ['bg-subtle', 'bg-accent-soft', 'bg-primary/50', 'bg-primary', 'bg-accent-ink'];

export function BestTimeMock() {
  return (
    <Frame title="Insights · Best time to post">
      <div className="p-4">
        <div className="grid grid-cols-[32px_repeat(8,minmax(0,1fr))] gap-1 text-2xs text-muted">
          <span />
          {HOURS.map((h) => (
            <span key={h} className="text-center tabular-nums">{h}h</span>
          ))}
          {DAYS.map((d, r) => (
            <div key={d} className="contents">
              <span className="self-center">{d}</span>
              {SCORES[r]!.map((s, c) => (
                <span key={c} className={cn('h-5 rounded-[5px]', SHADE[s])} />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1.5">
          {[
            ['Thu 20:00', '2.4× your typical post'],
            ['Sun 20:00', '2.1× your typical post'],
            ['Sat 22:00', '1.8× your typical post'],
          ].map(([t, s], i) => (
            <div key={t} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[12px]">
              <span className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent-ink">{i + 1}</span>
              <span className="font-medium">{t}</span>
              <span className="text-muted">{s}</span>
            </div>
          ))}
          <p className="pt-1 text-[12px] font-medium text-accent-ink">+ Add these times to my queue</p>
        </div>
      </div>
    </Frame>
  );
}

const COMMENTS: { p: Platform; who: string; text: string; tag?: string }[] = [
  { p: 'INSTAGRAM', who: 'riya.eats', text: 'Is the paneer combo available for delivery? 😍', tag: 'Assigned to Aman' },
  { p: 'YOUTUBE', who: 'Karan Mehta', text: 'Please share the masala chai recipe next!' },
  { p: 'FACEBOOK', who: 'Sneha Patil', text: 'What time do you open on Sundays?' },
];

export function InboxMock() {
  return (
    <Frame title="Community · Comments">
      <div className="divide-y divide-line">
        {COMMENTS.map((c, i) => (
          <div key={c.who} className={cn('flex gap-2.5 p-3', i === 0 && 'bg-accent-soft/40')}>
            <PlatformIcon platform={c.p} size={20} />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium">
                {c.who} {c.tag && <span className="ml-1 rounded bg-violet-soft px-1.5 py-0.5 text-2xs font-normal text-violet">{c.tag}</span>}
              </p>
              <p className="mt-0.5 text-[13px] text-fg/90">{c.text}</p>
            </div>
          </div>
        ))}
        <div className="p-3">
          <div className="flex items-start gap-2 rounded-lg border border-line p-2.5 text-[12px]">
            <CornerDownRight className="mt-0.5 size-3.5 text-muted" />
            <p className="flex-1 text-fg/90">Yes! Order on our website, we deliver till 11 pm 🙌</p>
            <Send className="size-3.5 text-accent-ink" />
          </div>
          <p className="mt-2 flex items-center gap-1 text-2xs text-muted">
            <Sparkles className="size-3" /> Saved reply: “Delivery timings”
          </p>
        </div>
      </div>
    </Frame>
  );
}

export function InstagramMock() {
  return (
    <div className="mx-auto w-full max-w-[280px]" aria-hidden>
      <div className="overflow-hidden rounded-[28px] border-[6px] border-[#1b1c1a] bg-surface shadow-pop">
        <div className="flex items-center gap-2 px-3 py-2">
          <PlatformIcon platform="INSTAGRAM" size={22} />
          <div className="text-[11px] leading-tight">
            <p className="font-semibold">masalabox</p>
            <p className="text-muted">with urbanchai</p>
          </div>
          <span className="ml-auto rounded bg-subtle px-1.5 py-0.5 text-2xs text-muted">Reel</span>
        </div>
        <div className="relative aspect-[4/5] bg-gradient-to-br from-amber-200 via-orange-300 to-rose-300">
          <span className="absolute left-4 top-1/3 rounded-md bg-black/70 px-1.5 py-0.5 text-2xs text-white">@chef.anita</span>
          <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2 py-0.5 text-2xs text-white">0:24</span>
        </div>
        <div className="space-y-1 px-3 py-2.5 text-[11px]">
          <p>
            <span className="font-semibold">masalabox</span> Behind the scenes of our monsoon menu 🎬
          </p>
          <p className="text-muted">
            <span className="font-semibold text-fg">masalabox</span> #monsoon #reels #chai — first comment
          </p>
        </div>
      </div>
      <div className="mx-auto mt-3 flex w-fit items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-2xs text-muted shadow-card">
        <UserPlus className="size-3" /> Collaborator invite sent
      </div>
    </div>
  );
}

const PROJECTS: { name: string; color: string; linked: Platform[] }[] = [
  { name: 'Masala Box', color: '#f59e0b', linked: ['INSTAGRAM', 'FACEBOOK', 'YOUTUBE'] },
  { name: 'Urban Threads', color: '#ec4899', linked: ['INSTAGRAM', 'X', 'LINKEDIN'] },
  { name: 'Kaveri Clinic', color: '#0ea5e9', linked: ['FACEBOOK', 'LINKEDIN'] },
];

export function ProjectsMock() {
  return (
    <Frame title="Settings · Projects & channels">
      <div className="space-y-2 p-4">
        {PROJECTS.map((p) => (
          <div key={p.name} className="flex items-center gap-3 rounded-lg border border-line p-2.5">
            <span className="flex size-7 items-center justify-center rounded-md text-[12px] font-semibold text-white" style={{ background: p.color }}>
              {p.name[0]}
            </span>
            <p className="text-[13px] font-medium">{p.name}</p>
            <div className="ml-auto flex gap-1">
              {PLATFORMS.map((pl) => (
                <PlatformIcon key={pl} platform={pl} size={16} muted={!p.linked.includes(pl)} />
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5 pt-1 text-2xs">
          {['Owner', 'Admin', 'Publisher', 'Analyst'].map((r) => (
            <span key={r} className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-muted">
              <Check className="size-3" /> {r}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

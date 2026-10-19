import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { PlatformIcon } from '@/components/platform-icon';
import { PLATFORMS } from '@/lib/platforms';

const NAV = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line/60 bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 text-[14px] text-fg/75 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-full px-3 py-1.5 transition hover:bg-hover hover:text-fg">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <Button asChild variant="ghost" className="rounded-full">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild variant="primary" className="rounded-full px-5">
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
          <details className="group relative ml-auto sm:hidden [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full border border-line bg-surface" aria-label="Menu">
              <Menu className="size-4" />
            </summary>
            <div className="absolute right-0 top-11 w-56 rounded-2xl border border-line bg-surface p-2 shadow-pop">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2 text-[14px] hover:bg-hover">
                  {n.label}
                </Link>
              ))}
              <div className="my-1 border-t border-line" />
              <Link href="/login" className="block rounded-lg px-3 py-2 text-[14px] hover:bg-hover">
                Sign in
              </Link>
              <Button asChild variant="primary" className="mt-1 w-full rounded-full">
                <Link href="/signup">Get started</Link>
              </Button>
            </div>
          </details>
        </div>
      </header>
      <main className="flex-1 overflow-x-clip">{children}</main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-muted">Plan, schedule and publish social media for every brand you manage, from one calm place.</p>
            <div className="mt-4 flex gap-1.5">
              {PLATFORMS.map((p) => (
                <PlatformIcon key={p} platform={p} size={20} />
              ))}
            </div>
          </div>
          <FooterCol title="Product" links={[['Features', '/features'], ['Pricing', '/pricing'], ['FAQ', '/#faq']]} />
          <FooterCol title="Account" links={[['Sign in', '/login'], ['Create account', '/signup']]} />
          <FooterCol title="Legal" links={[['Terms', '/legal/terms'], ['Privacy', '/legal/privacy'], ['Data deletion', '/legal/data-deletion']]} />
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-6xl px-4 py-5 text-[13px] text-muted sm:px-6">© {new Date().getFullYear()} SocialDesk. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-[13px] font-semibold">{title}</p>
      <ul className="mt-3 space-y-2 text-[14px] text-muted">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="transition hover:text-fg">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

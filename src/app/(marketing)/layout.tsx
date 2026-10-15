import Link from 'next/link';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-5 text-[14px] text-fg/80 sm:flex">
            <Link href="/features" className="hover:text-fg">Features</Link>
            <Link href="/pricing" className="hover:text-fg">Pricing</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-[13px] text-muted sm:px-6">
          <Logo className="text-sm" />
          <span>© {new Date().getFullYear()} SocialDesk</span>
          <nav className="ml-auto flex gap-4">
            <Link href="/features" className="hover:text-fg">Features</Link>
            <Link href="/pricing" className="hover:text-fg">Pricing</Link>
            <Link href="/legal/terms" className="hover:text-fg">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-fg">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

import Link from 'next/link';
import { requireSuperAdminPage } from '@/server/auth/session';
import { Logo } from '@/components/brand';
import { AdminNav } from '@/components/admin/admin-nav';
import { ThemeSwitch } from '@/components/theme';

export const metadata = { title: { default: 'Super admin', template: '%s · Super admin' } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdminPage();
  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-4 px-3 py-4 md:flex">
        <Logo href="/admin" className="px-2" />
        <span className="mx-2 w-fit rounded-full bg-violet-soft px-2 py-0.5 text-xs font-medium text-violet">Super admin</span>
        <AdminNav />
        <div className="mt-auto border-t border-line px-2 pt-3 text-xs text-muted">
          <ThemeSwitch className="mb-2" />
          <p>{user.email}</p>
          <Link href="/app" className="mt-1 block text-fg hover:underline">
            ← Back to app
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-surface md:my-1.5 md:mr-1.5 md:rounded-xl md:border md:border-line">
        <div className="border-b border-line px-4 py-2 md:hidden">
          <AdminNav horizontal />
        </div>
        <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">{children}</div>
      </main>
    </div>
  );
}

import Link from 'next/link';
import { requireUserPage } from '@/server/auth/session';
import { listUserWorkspaces } from '@/server/services/workspaces';
import { Logo } from '@/components/brand';
import { CreateWorkspaceForm } from '@/components/workspace/create-workspace-form';

export const metadata = { title: 'Create a workspace' };

export default async function OnboardingPage() {
  const user = await requireUserPage();
  const existing = await listUserWorkspaces(user.id);
  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 py-10">
      <Logo className="mb-8" href="/app" />
      <main className="w-full max-w-[440px] rounded-xl border border-line bg-surface p-6 shadow-card sm:p-7">
        <p className="text-xs font-medium uppercase tracking-wide text-accent-ink">{existing.length ? 'New workspace' : 'Step 1 of 2'}</p>
        <h1 className="mt-1 text-xl font-semibold">{existing.length ? 'Create another workspace' : `Welcome, ${user.name?.split(' ')[0] ?? 'there'}!`}</h1>
        <p className="mb-5 mt-1 text-[13px] text-muted">
          A workspace holds one brand&apos;s channels, posts and team. You can create more later.
        </p>
        <CreateWorkspaceForm />
        {existing.length > 0 && (
          <p className="mt-4 text-center text-[13px] text-muted">
            <Link href="/app" className="hover:text-fg">Back to my workspaces</Link>
          </p>
        )}
      </main>
    </div>
  );
}

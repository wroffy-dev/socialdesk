import { Settings } from 'lucide-react';
import { requireWorkspacePage } from '@/server/auth/workspace';
import { permissionsFor } from '@/lib/permissions';
import { PageHeader } from '@/components/page-header';
import { SettingsNav } from '@/components/settings/settings-nav';

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  return (
    <>
      <PageHeader icon={<Settings />} title="Settings" description={ctx.workspace.name} />
      <div className="flex flex-col gap-6 px-5 pb-10 sm:px-8 md:flex-row">
        <SettingsNav slug={slug} permissions={permissionsFor(ctx.role)} />
        <div className="min-w-0 max-w-3xl flex-1">{children}</div>
      </div>
    </>
  );
}

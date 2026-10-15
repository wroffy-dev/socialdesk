import { FolderKanban } from 'lucide-react';
import { requireWorkspacePage } from '@/server/auth/workspace';
import { hasPermission } from '@/server/auth/ctx';
import { listProjects } from '@/server/services/projects';
import { PageHeader } from '@/components/page-header';
import { ProjectsManager } from '@/components/channels/projects-manager';

export const metadata = { title: 'Projects & channels' };

export default async function ChannelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; connected?: string; new?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspacePage(slug);
  const data = await listProjects(ctx);
  return (
    <>
      <PageHeader icon={<FolderKanban />} title="Projects & channels" description="Each project is a brand or client with one account per platform: Instagram, Facebook, X, LinkedIn and YouTube." />
      <ProjectsManager
        initial={data}
        workspace={{ id: ctx.workspace.id, slug }}
        canManage={hasPermission(ctx, 'channels.manage')}
        emailVerified={!!ctx.user.emailVerified}
        error={sp.error ?? null}
        connected={sp.connected ? Number(sp.connected) : null}
        openNew={sp.new === '1'}
      />
    </>
  );
}

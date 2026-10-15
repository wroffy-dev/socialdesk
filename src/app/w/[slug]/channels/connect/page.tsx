import { redirect } from 'next/navigation';
import { Plug } from 'lucide-react';
import { requireWorkspacePage } from '@/server/auth/workspace';
import { getPendingConnection } from '@/server/services/channels';
import { PageHeader } from '@/components/page-header';
import { PendingAccounts } from '@/components/channels/pending-accounts';

export const metadata = { title: 'Choose accounts' };

export default async function ConnectPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ pending?: string }> }) {
  const { slug } = await params;
  const { pending } = await searchParams;
  const ctx = await requireWorkspacePage(slug);
  if (!pending) redirect(`/w/${slug}/channels`);
  const data = await getPendingConnection(ctx, pending).catch(() => null);
  if (!data) redirect(`/w/${slug}/channels?error=${encodeURIComponent('This connection request expired. Please connect again.')}`);
  return (
    <>
      <PageHeader icon={<Plug />} title="Choose accounts to connect" description={`Signed in to Facebook as ${data.fbUserName}.`} />
      <PendingAccounts data={data} pendingId={pending} workspace={{ id: ctx.workspace.id, slug }} />
    </>
  );
}

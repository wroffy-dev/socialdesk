import { requireWorkspacePage } from '@/server/auth/workspace';
import { getCurrentUser } from '@/server/auth/session';
import { getShellData } from '@/server/services/shell';
import { AppShell } from '@/components/shell/app-shell';

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  const user = (await getCurrentUser())!;
  const data = await getShellData(ctx, user);
  return <AppShell data={data}>{children}</AppShell>;
}

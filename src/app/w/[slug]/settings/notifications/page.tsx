import { requireWorkspacePage } from '@/server/auth/workspace';
import { getNotificationPrefs } from '@/server/services/settings';
import { NotificationSettings } from '@/components/settings/notification-settings';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  return <NotificationSettings workspaceId={ctx.workspace.id} initial={await getNotificationPrefs(ctx)} isManager={ctx.role === 'OWNER' || ctx.role === 'ADMIN'} />;
}

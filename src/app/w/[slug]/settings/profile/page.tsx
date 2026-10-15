import { requireUserPage } from '@/server/auth/session';
import { ProfileSettings } from '@/components/settings/profile-settings';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const user = await requireUserPage();
  return <ProfileSettings user={{ name: user.name ?? '', email: user.email, timezone: user.timezone, emailVerified: !!user.emailVerified }} />;
}

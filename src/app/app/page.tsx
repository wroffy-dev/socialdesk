import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { requireUserPage } from '@/server/auth/session';
import { listUserWorkspaces } from '@/server/services/workspaces';

/** Entry point after sign-in: the last-used workspace, else the first one, else onboarding. */
export default async function AppEntry() {
  const user = await requireUserPage();
  const workspaces = await listUserWorkspaces(user.id);
  if (workspaces.length === 0) redirect('/onboarding');
  const last = (await cookies()).get('sd_last_ws')?.value;
  const target = workspaces.find((w) => w.slug === last) ?? workspaces[0]!;
  redirect(`/w/${target.slug}/home`);
}

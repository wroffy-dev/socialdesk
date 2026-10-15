import Link from 'next/link';
import { getCurrentUser } from '@/server/auth/session';
import { getInvitationByToken } from '@/server/services/members';
import { AcceptInviteButton } from '@/components/auth/accept-invite';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { ROLE_LABEL } from '@/lib/permissions';

export const metadata = { title: 'Workspace invitation' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, user] = await Promise.all([getInvitationByToken(token), getCurrentUser()]);

  if (!invite || !invite.usable) {
    return (
      <>
        <h1 className="mb-4 text-xl font-semibold">Invitation unavailable</h1>
        <Alert variant="warning">This invitation has expired, was revoked, or has already been used. Ask the workspace admin to send a new one.</Alert>
      </>
    );
  }

  const next = `/invite/${token}`;
  const inviter = invite.invitedBy?.name ?? invite.invitedBy?.email ?? 'A teammate';
  return (
    <>
      <h1 className="text-xl font-semibold">Join {invite.workspace.name}</h1>
      <p className="mb-5 mt-1 text-[13px] text-muted">
        {inviter} invited <strong className="text-fg">{invite.email}</strong> to join as {ROLE_LABEL[invite.role]}.
      </p>
      {!user ? (
        <div className="flex flex-col gap-2">
          <Button asChild variant="primary" size="lg">
            <Link href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`}>Create an account</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={`/login?next=${encodeURIComponent(next)}`}>I already have an account</Link>
          </Button>
        </div>
      ) : user.email.toLowerCase() !== invite.email.toLowerCase() ? (
        <Alert variant="warning" title="Different account">
          You&apos;re signed in as {user.email}. Sign out and sign in as {invite.email} to accept this invitation.
        </Alert>
      ) : (
        <AcceptInviteButton token={token} />
      )}
    </>
  );
}

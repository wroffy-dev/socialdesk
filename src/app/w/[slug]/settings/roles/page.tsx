import { Check, Minus } from 'lucide-react';
import { requireWorkspacePage } from '@/server/auth/workspace';
import { PERMISSIONS, ROLE_DESCRIPTION, ROLE_LABEL, ROLES, can, type Permission } from '@/lib/permissions';
import { SettingsSection } from '@/components/settings/section';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

export const metadata = { title: 'Roles & permissions' };

const LABELS: Record<Permission, string> = {
  'workspace.view': 'View the workspace',
  'workspace.update': 'Edit workspace settings',
  'workspace.delete': 'Delete the workspace',
  'members.view': 'See team members',
  'members.manage': 'Invite, remove and change roles',
  'channels.view': 'See connected channels',
  'channels.manage': 'Connect and disconnect channels',
  'posts.view': 'View posts and calendar',
  'posts.edit': 'Create and edit drafts',
  'posts.publish': 'Schedule, publish and retry posts',
  'queue.manage': 'Change the posting schedule',
  'media.view': 'View the media library',
  'media.upload': 'Upload media',
  'media.delete': 'Delete media',
  'tags.manage': 'Manage tags',
  'analytics.view': 'View insights',
  'community.view': 'Read comments and messages',
  'community.reply': 'Reply to comments',
  'savedReplies.manage': 'Manage saved replies',
  'billing.view': 'View billing and usage',
  'billing.manage': 'Change plan and payment',
  'audit.view': 'View the audit log',
};

export default async function RolesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  return (
    <SettingsSection title="Roles & permissions" description={`Your role here is ${ROLE_LABEL[ctx.role]}. Permissions are enforced on the server for every request.`}>
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        {ROLES.map((r) => (
          <div key={r} className="rounded-lg bg-subtle p-3 text-[13px]">
            <p className="font-medium">{ROLE_LABEL[r]}</p>
            <p className="text-muted">{ROLE_DESCRIPTION[r]}</p>
          </div>
        ))}
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Permission</TH>
            {ROLES.map((r) => (
              <TH key={r} className="text-center">
                {ROLE_LABEL[r]}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
            <TR key={p}>
              <TD className="text-[13px]">{LABELS[p]}</TD>
              {ROLES.map((r) => (
                <TD key={r} className="text-center">
                  {can(r, p) ? <Check className="mx-auto size-4 text-accent-ink" aria-label="Allowed" /> : <Minus className="mx-auto size-4 text-faint" aria-label="Not allowed" />}
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
    </SettingsSection>
  );
}

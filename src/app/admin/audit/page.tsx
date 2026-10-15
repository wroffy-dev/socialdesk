import { AuditLog } from '@/components/settings/audit-log';
import { AdminTitle } from '@/components/admin/ui';

export const metadata = { title: 'Audit log' };

export default function AdminAudit() {
  return (
    <>
      <AdminTitle title="Audit log" description="Every sensitive action across the platform." />
      <AuditLog endpoint="/api/admin/audit" title="All activity" />
    </>
  );
}

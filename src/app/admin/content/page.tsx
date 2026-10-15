import { db } from '@/server/db';
import { AdminTitle } from '@/components/admin/ui';
import { ContentEditor } from '@/components/admin/content-editor';

export const metadata = { title: 'Legal pages' };

export default async function AdminContent() {
  const pages = await db.siteContent.findMany({ where: { key: { in: ['terms', 'privacy'] } }, orderBy: { key: 'asc' } });
  return (
    <>
      <AdminTitle title="Legal pages" description="Markdown shown at /legal/terms and /legal/privacy." />
      <div className="flex flex-col gap-6">
        {pages.map((p) => (
          <ContentEditor key={p.key} page={{ key: p.key, title: p.title, body: p.body, updatedAt: p.updatedAt.toISOString() }} />
        ))}
      </div>
    </>
  );
}

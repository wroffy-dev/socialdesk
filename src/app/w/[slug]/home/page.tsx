import { requireWorkspacePage } from '@/server/auth/workspace';
import { PageBody, PageHeader } from '@/components/page-header';

export default async function HomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireWorkspacePage(slug);
  return (
    <>
      <PageHeader icon={<span>👋</span>} title={`Hello, ${ctx.user.name ?? 'there'}`} />
      <PageBody />
    </>
  );
}

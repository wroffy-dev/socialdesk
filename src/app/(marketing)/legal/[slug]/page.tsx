import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { Markdown } from '@/components/markdown';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: slug === 'terms' ? 'Terms of Service' : slug === 'privacy' ? 'Privacy Policy' : 'Data deletion' };
}

export default async function LegalPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ code?: string }> }) {
  const { slug } = await params;
  if (slug === 'data-deletion') {
    const { code } = await searchParams;
    return (
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Markdown
          source={`# Data deletion\n\nWhen you remove SocialDesk from your Facebook account or request deletion, we delete the access tokens we stored for your Pages and Instagram accounts and stop all scheduled publishing for them.\n\nTo delete your whole SocialDesk account and workspaces, sign in and delete each workspace from Settings → General, or contact support.${code ? `\n\n**Confirmation code:** ${code.replace(/[^a-zA-Z0-9]/g, '')}` : ''}`}
        />
      </article>
    );
  }
  if (slug !== 'terms' && slug !== 'privacy') notFound();
  const page = await db.siteContent.findUnique({ where: { key: slug } });
  if (!page) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <Markdown source={page.body} />
      <p className="mt-10 text-xs text-muted">Last updated {page.updatedAt.toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
    </article>
  );
}

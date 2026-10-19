import { listSocialProof } from '@/server/services/social-proof';
import { AdminTitle } from '@/components/admin/ui';
import { SocialProofEditor } from '@/components/admin/social-proof-editor';

export const metadata = { title: 'Testimonials & logos' };
export const dynamic = 'force-dynamic';

export default async function AdminTestimonials() {
  const { testimonials, logos } = await listSocialProof();
  return (
    <>
      <AdminTitle
        title="Testimonials & logos"
        description="Shown on the home page once published. Use only real customers’ words and logos, with their permission. Sections stay hidden while nothing is published."
      />
      <SocialProofEditor
        testimonials={testimonials.map(({ id, quote, authorName, authorRole, company, avatarUrl, isPublished, sortOrder }) => ({ id, quote, authorName, authorRole, company, avatarUrl, isPublished, sortOrder }))}
        logos={logos.map(({ id, name, imageUrl, websiteUrl, isPublished, sortOrder }) => ({ id, name, imageUrl, websiteUrl, isPublished, sortOrder }))}
      />
    </>
  );
}

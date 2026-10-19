import { z } from 'zod';
import { db } from '../db';
import { notFound } from '../errors';
import { audit } from '../audit';

/**
 * Customer testimonials and logos for the marketing site. Super admins add real quotes and
 * logos; nothing is shown until an entry is published, so the site never shows placeholders.
 */

type Admin = { id: string };

/** Only https images/links, so admin input can't inject other schemes into the page. */
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .url('Enter a full URL')
  .refine((v) => v.startsWith('https://'), 'Use an https:// URL')
  .nullable()
  .or(z.literal('').transform(() => null));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);

export const testimonialSchema = z.object({
  quote: z.string().trim().min(10, 'Add the customer’s words').max(600),
  authorName: z.string().trim().min(1, 'Add a name').max(80),
  authorRole: optionalText(80),
  company: optionalText(80),
  avatarUrl: httpsUrl,
  isPublished: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});

export const customerLogoSchema = z.object({
  name: z.string().trim().min(1, 'Add the company name').max(80),
  imageUrl: httpsUrl,
  websiteUrl: httpsUrl,
  isPublished: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});

const order = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

export async function listSocialProof() {
  const [testimonials, logos] = await Promise.all([db.testimonial.findMany({ orderBy: order }), db.customerLogo.findMany({ orderBy: order })]);
  return { testimonials, logos };
}

/** Published entries for the public site. */
export async function publishedSocialProof() {
  const [testimonials, logos] = await Promise.all([
    db.testimonial.findMany({ where: { isPublished: true }, orderBy: order, take: 12 }),
    db.customerLogo.findMany({ where: { isPublished: true }, orderBy: order, take: 24 }),
  ]);
  return {
    testimonials: testimonials.map(({ id, quote, authorName, authorRole, company, avatarUrl }) => ({ id, quote, authorName, authorRole, company, avatarUrl })),
    logos: logos.map(({ id, name, imageUrl, websiteUrl }) => ({ id, name, imageUrl, websiteUrl })),
  };
}

export type PublicSocialProof = Awaited<ReturnType<typeof publishedSocialProof>>;

export async function saveTestimonial(admin: Admin, id: string | null, raw: unknown) {
  const data = testimonialSchema.parse(raw);
  if (id && !(await db.testimonial.findUnique({ where: { id } }))) throw notFound('Testimonial');
  const row = id ? await db.testimonial.update({ where: { id }, data }) : await db.testimonial.create({ data });
  await audit({ action: id ? 'admin.testimonial_updated' : 'admin.testimonial_created', actorId: admin.id, targetType: 'testimonial', targetId: row.id, metadata: { author: row.authorName, published: row.isPublished } });
  return row;
}

export async function deleteTestimonial(admin: Admin, id: string) {
  const row = await db.testimonial.findUnique({ where: { id } });
  if (!row) throw notFound('Testimonial');
  await db.testimonial.delete({ where: { id } });
  await audit({ action: 'admin.testimonial_deleted', actorId: admin.id, targetType: 'testimonial', targetId: id, metadata: { author: row.authorName } });
}

export async function saveCustomerLogo(admin: Admin, id: string | null, raw: unknown) {
  const data = customerLogoSchema.parse(raw);
  if (id && !(await db.customerLogo.findUnique({ where: { id } }))) throw notFound('Logo');
  const row = id ? await db.customerLogo.update({ where: { id }, data }) : await db.customerLogo.create({ data });
  await audit({ action: id ? 'admin.logo_updated' : 'admin.logo_created', actorId: admin.id, targetType: 'customer_logo', targetId: row.id, metadata: { name: row.name, published: row.isPublished } });
  return row;
}

export async function deleteCustomerLogo(admin: Admin, id: string) {
  const row = await db.customerLogo.findUnique({ where: { id } });
  if (!row) throw notFound('Logo');
  await db.customerLogo.delete({ where: { id } });
  await audit({ action: 'admin.logo_deleted', actorId: admin.id, targetType: 'customer_logo', targetId: id, metadata: { name: row.name } });
}

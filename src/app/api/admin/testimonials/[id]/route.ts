import { route } from '@/server/http';
import { requireSuperAdmin } from '@/server/auth/session';
import { deleteTestimonial, saveTestimonial } from '@/server/services/social-proof';

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const admin = await requireSuperAdmin();
  return saveTestimonial(admin, params.id, await req.json().catch(() => null));
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const admin = await requireSuperAdmin();
  await deleteTestimonial(admin, params.id);
});

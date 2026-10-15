import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { isValidTimezone } from '@/lib/timezones';

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().refine(isValidTimezone, 'Choose a valid timezone').nullable().optional(),
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const data = await parseJson(req, schema);
  const updated = await db.user.update({ where: { id: user.id }, data, select: { id: true, name: true, timezone: true } });
  return { user: updated };
});

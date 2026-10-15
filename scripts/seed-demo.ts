/**
 * Local development only: creates a demo login with a workspace and MOCK channels
 * (the mock adapter never contacts a real platform). Refuses to run in production.
 *
 *   npm run db:seed:demo
 *   → demo@socialdesk.local / demo-password-1
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createCipheriv, randomBytes } from 'node:crypto';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}

const db = new PrismaClient();

function encrypt(text: string) {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? '', 'base64');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

async function main() {
  const email = 'demo@socialdesk.local';
  const user = await db.user.upsert({
    where: { email },
    create: { email, name: 'Demo User', emailVerified: new Date(), passwordHash: await bcrypt.hash('demo-password-1', 10) },
    update: {},
  });
  let ws = await db.workspace.findUnique({ where: { slug: 'digi-emporia' } });
  if (!ws) {
    const free = await db.plan.findUniqueOrThrow({ where: { key: 'pro' } });
    ws = await db.workspace.create({
      data: {
        name: 'Digi Emporia',
        slug: 'digi-emporia',
        timezone: 'Asia/Kolkata',
        createdById: user.id,
        members: { create: { userId: user.id, role: 'OWNER' } },
        subscription: { create: { planId: free.id } },
        queueSettings: { create: {} },
        queueSlots: { createMany: { data: [1, 2, 3, 4, 5].flatMap((d) => [{ dayOfWeek: d, time: '09:30' }, { dayOfWeek: d, time: '18:00' }]) } },
      },
    });
  }
  const project =
    (await db.project.findFirst({ where: { workspaceId: ws.id }, orderBy: { createdAt: 'asc' } })) ??
    (await db.project.create({ data: { workspaceId: ws.id, name: 'Digi Emporia' } }));
  const channels = [
    { platform: 'INSTAGRAM' as const, externalId: 'mock-ig-1', name: 'Digi Emporia', username: 'digi_emporia' },
    { platform: 'FACEBOOK' as const, externalId: 'mock-fb-1', name: 'Digi Emporia', username: null },
  ];
  for (const c of channels) {
    await db.socialAccount.upsert({
      where: { workspaceId_platform_externalId: { workspaceId: ws.id, platform: c.platform, externalId: c.externalId } },
      create: { ...c, workspaceId: ws.id, projectId: project.id, accessTokenEnc: encrypt('mock-token'), mode: 'MOCK', scopes: [], connectedById: user.id },
      update: {},
    });
  }
  await db.contentTag.upsert({ where: { workspaceId_name: { workspaceId: ws.id, name: 'Promo' } }, create: { workspaceId: ws.id, name: 'Promo', color: '#e879a6' }, update: {} });
  await db.contentTag.upsert({ where: { workspaceId_name: { workspaceId: ws.id, name: 'Tips' } }, create: { workspaceId: ws.id, name: 'Tips', color: '#60a5fa' }, update: {} });
  console.log(`Demo ready: ${email} / demo-password-1 → /w/${ws.slug}/home`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

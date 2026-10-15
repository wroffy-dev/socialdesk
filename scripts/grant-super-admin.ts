/**
 * Grants (or with --revoke, removes) super-admin access. This is the only way to create a
 * super admin; there is no API for it.
 *
 *   npm run admin:grant -- someone@example.com
 *   npm run admin:grant -- someone@example.com --revoke
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const [email, flag] = process.argv.slice(2);

async function main() {
  if (!email) throw new Error('Usage: npm run admin:grant -- <email> [--revoke]');
  const revoke = flag === '--revoke';
  const user = await db.user.update({
    where: { email: email.toLowerCase() },
    data: { isSuperAdmin: !revoke, sessionVersion: { increment: 1 } },
  });
  await db.auditLog.create({ data: { action: revoke ? 'admin.revoked_cli' : 'admin.granted_cli', targetType: 'user', targetId: user.id } });
  console.log(`${revoke ? 'Revoked' : 'Granted'} super admin for ${user.email}. They need to sign in again.`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

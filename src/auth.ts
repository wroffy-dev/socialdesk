import NextAuth, { CredentialsSignin, type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { z } from 'zod';
import { db } from '@/server/db';
import { DUMMY_HASH, verifyPassword } from '@/server/auth/password';
import { rateLimit } from '@/server/rate-limit';
import { audit } from '@/server/audit';
import { clientIp } from '@/server/request';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}

class RateLimited extends CredentialsSignin {
  code = 'rate_limited';
}
class Locked extends CredentialsSignin {
  code = 'locked';
}
class Suspended extends CredentialsSignin {
  code = 'suspended';
}

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  // Credentials sign-in requires JWT sessions. Each token carries the user's sessionVersion,
  // checked against the database on every request so sessions can be revoked server-side.
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const ip = clientIp(request);
        const [byIp, byEmail] = await Promise.all([
          rateLimit(`login:ip:${ip}`, 30, 15 * 60),
          rateLimit(`login:email:${email}`, 10, 15 * 60),
        ]);
        if (process.env.DISABLE_RATE_LIMIT !== 'true' && (!byIp.ok || !byEmail.ok)) throw new RateLimited();

        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          await verifyPassword(password, DUMMY_HASH);
          return null;
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) throw new Locked();

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          const failed = user.failedLoginCount + 1;
          await db.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: failed >= MAX_FAILED ? 0 : failed,
              lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
            },
          });
          if (failed >= MAX_FAILED) await audit({ action: 'auth.locked', actorId: user.id, ip });
          return null;
        }
        if (user.status === 'SUSPENDED') throw new Suspended();

        await db.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        await audit({ action: 'auth.login', actorId: user.id, ip });
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        const fresh = await db.user.findUnique({ where: { id: user.id }, select: { sessionVersion: true } });
        token.uid = user.id;
        token.sv = fresh?.sessionVersion ?? 0;
        return token;
      }
      if (typeof token.uid !== 'string') return null;
      const current = await db.user.findUnique({
        where: { id: token.uid },
        select: { status: true, sessionVersion: true, name: true, email: true, image: true },
      });
      if (!current || current.status !== 'ACTIVE' || current.sessionVersion !== token.sv) return null;
      token.name = current.name;
      token.email = current.email;
      token.picture = current.image;
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === 'string') session.user.id = token.uid;
      return session;
    },
  },
});

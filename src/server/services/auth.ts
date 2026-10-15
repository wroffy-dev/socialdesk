import { z } from 'zod';
import { db } from '../db';
import { env } from '../env';
import { badRequest, conflict, forbidden } from '../errors';
import { hashToken, randomToken } from '../crypto';
import { hashPassword, passwordSchema } from '../auth/password';
import { layout, sendMail } from '../mail';
import { audit } from '../audit';

export const signupSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(254),
  password: passwordSchema,
});

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export async function signup(input: z.infer<typeof signupSchema>, ip?: string) {
  if (!env().SIGNUPS_ENABLED) throw forbidden('Sign-ups are currently closed.');
  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw conflict('An account with this email already exists. Sign in or reset your password.');
  const user = await db.user.create({
    data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password) },
    select: { id: true, email: true, name: true },
  });
  await audit({ action: 'auth.signup', actorId: user.id, ip });
  await sendVerificationEmail(user.id);
  return user;
}

async function issueToken(userId: string, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET', ttlMs: number) {
  const token = randomToken();
  await db.$transaction([
    // Only the newest link of each kind works.
    db.userToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }),
    db.userToken.create({ data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) } }),
  ]);
  return token;
}

export async function sendVerificationEmail(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, name: true } });
  if (!user || user.emailVerified) return;
  const token = await issueToken(userId, 'EMAIL_VERIFICATION', VERIFY_TTL_MS);
  const url = `${env().APP_URL}/verify-email?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Verify your email for SocialDesk',
    text: `Hi ${user.name ?? ''},\n\nConfirm your email address to finish setting up SocialDesk:\n${url}\n\nThis link expires in 24 hours.`,
    html: layout({ heading: 'Verify your email', body: 'Confirm your email address to finish setting up SocialDesk. This link expires in 24 hours.', actionLabel: 'Verify email', actionUrl: url }),
  });
}

/** Consumes a single-use token atomically; returns the user id or throws. */
async function consumeToken(token: string, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') {
  const tokenHash = hashToken(token);
  const row = await db.userToken.findUnique({ where: { tokenHash } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) {
    throw badRequest('This link is invalid or has expired. Request a new one.');
  }
  const res = await db.userToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (res.count !== 1) throw badRequest('This link has already been used.');
  return row.userId;
}

export async function verifyEmail(token: string) {
  const userId = await consumeToken(token, 'EMAIL_VERIFICATION');
  await db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  await audit({ action: 'auth.email_verified', actorId: userId });
}

/** Always succeeds from the caller's point of view so registered emails are not revealed. */
export async function requestPasswordReset(email: string, ip?: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, email: true, status: true } });
  if (!user || user.status !== 'ACTIVE') return;
  const token = await issueToken(user.id, 'PASSWORD_RESET', RESET_TTL_MS);
  const url = `${env().APP_URL}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your SocialDesk password',
    text: `Someone asked to reset the password for this account.\n\nChoose a new password:\n${url}\n\nThis link expires in 1 hour. If you didn't ask for this, ignore this email.`,
    html: layout({ heading: 'Reset your password', body: "Choose a new password using the button below. The link expires in 1 hour. If you didn't ask for this, you can ignore this email.", actionLabel: 'Reset password', actionUrl: url }),
  });
  await audit({ action: 'auth.password_reset_requested', actorId: user.id, ip });
}

export async function resetPassword(token: string, password: string, ip?: string) {
  passwordSchema.parse(password);
  const userId = await consumeToken(token, 'PASSWORD_RESET');
  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      // Signs out every existing session.
      sessionVersion: { increment: 1 },
      failedLoginCount: 0,
      lockedUntil: null,
      // Receiving the reset email proves ownership of the address.
      emailVerified: new Date(),
    },
  });
  await audit({ action: 'auth.password_reset', actorId: userId, ip });
}

export async function changePassword(userId: string, current: string, next: string) {
  const { verifyPassword } = await import('../auth/password');
  passwordSchema.parse(next);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!user.passwordHash || !(await verifyPassword(current, user.passwordHash))) {
    throw badRequest('Your current password is incorrect.');
  }
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(next), sessionVersion: { increment: 1 } },
  });
  await audit({ action: 'auth.password_changed', actorId: userId });
}

/** Revokes every session for the user (including the current one). */
export async function signOutEverywhere(userId: string) {
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  await audit({ action: 'auth.sign_out_everywhere', actorId: userId });
}

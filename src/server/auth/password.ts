import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), 'Include at least one letter and one number');

const ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;

export const hashPassword = (password: string) => bcrypt.hash(password, ROUNDS);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/** Used when the user does not exist so response timing doesn't reveal registered emails. */
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', ROUNDS);

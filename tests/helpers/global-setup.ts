import { execSync } from 'node:child_process';
import { TEST_ENV } from './test-env';

/**
 * Applies migrations to the test database without wiping it. Tests create their own
 * uniquely named users/workspaces, so leftover rows from earlier runs don't interfere.
 */
export default function setup() {
  const env = { ...process.env, ...TEST_ENV };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'pipe' });
}

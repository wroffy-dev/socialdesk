/** Environment for the integration test suite. Uses a separate database. */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://socialdesk:socialdesk@localhost:5432/socialdesk_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15',
  APP_URL: 'http://localhost:3000',
  AUTH_SECRET: 'test-auth-secret-0123456789abcdef0123456789',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  MEDIA_SIGNING_SECRET: 'test-media-signing-secret-0123456789abcdef',
  STORAGE_LOCAL_DIR: './.data/test-storage',
  MAIL_TRANSPORT: 'log',
  META_MODE: 'mock',
  DISABLE_RATE_LIMIT: 'true',
};
TEST_ENV.PUBLISH_QUEUE_DISABLED = 'true';

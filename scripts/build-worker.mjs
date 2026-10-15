// Bundles the worker into dist/worker.cjs. Native/runtime-heavy packages stay external and are
// loaded from node_modules at runtime.
import { build } from 'esbuild';
import path from 'node:path';

await build({
  entryPoints: ['src/worker/index.ts'],
  outfile: 'dist/worker.cjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: ['@prisma/client', '.prisma/client', 'sharp', 'bullmq', 'ioredis', 'nodemailer', 'bcryptjs'],
  alias: {
    '@': path.resolve('src'),
    'server-only': path.resolve('scripts/empty-module.js'),
  },
  logLevel: 'info',
});

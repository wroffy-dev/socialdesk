import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../server/db';
import { reconcile } from '../server/publishing/reconciler';
import { runHealthCheck } from '../server/services/channels';
import { syncAnalytics } from '../server/services/analytics-sync';
import { syncComments } from '../server/services/community-sync';
import { tempDir } from '../server/storage';

export type MaintenanceTask = 'reconcile' | 'channel-health' | 'analytics-sync' | 'comments-sync' | 'cleanup';

export const MAINTENANCE_SCHEDULE: Record<MaintenanceTask, number> = {
  reconcile: 60_000,
  'channel-health': 6 * 3600_000,
  'analytics-sync': 6 * 3600_000,
  'comments-sync': 30 * 60_000,
  cleanup: 24 * 3600_000,
};

export async function runMaintenanceTask(task: MaintenanceTask): Promise<unknown> {
  switch (task) {
    case 'reconcile':
      return reconcile();
    case 'channel-health': {
      const accounts = await db.socialAccount.findMany({ where: { status: { in: ['CONNECTED', 'ERROR'] }, mode: { not: 'MOCK' } } });
      let broken = 0;
      for (const a of accounts) {
        const res = await runHealthCheck(a).catch(() => null);
        if (res && !res.ok) broken++;
      }
      return { checked: accounts.length, broken };
    }
    case 'analytics-sync':
      return syncAnalytics();
    case 'comments-sync':
      return syncComments();
    case 'cleanup': {
      // Abandoned upload temp files and old worker heartbeats.
      let removed = 0;
      try {
        for (const f of await readdir(tempDir())) {
          const p = path.join(tempDir(), f);
          if (Date.now() - (await stat(p)).mtimeMs > 6 * 3600_000) {
            await rm(p, { force: true });
            removed++;
          }
        }
      } catch {
        /* temp dir may not exist yet */
      }
      const beats = await db.workerHeartbeat.deleteMany({ where: { lastBeatAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
      return { tempFiles: removed, heartbeats: beats.count };
    }
  }
}

import type { Prisma } from '@prisma/client';
import { db, type Tx } from './db';

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  workspaceId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Records a sensitive action. Never throws: an audit failure must not break the user's request. */
export async function audit(entry: AuditEntry, tx: Tx = db) {
  try {
    await tx.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId ?? null,
        workspaceId: entry.workspaceId ?? null,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] failed to record', entry.action, err);
  }
}

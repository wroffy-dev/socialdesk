export const QUEUES = {
  publish: 'publish',
  maintenance: 'maintenance',
} as const;

/** Job id is unique per version *and* scheduled time, so a reschedule creates a new job. */
export const publishJobId = (platformPostId: string, scheduledAt: Date) => `pp-${platformPostId}-${scheduledAt.getTime()}`;

export interface PublishJobData {
  platformPostId: string;
  /** The scheduled time this job was created for; stale jobs are ignored. */
  scheduledAt: string;
}

-- Per-channel publishing options (Instagram Stories, collaborators, tagged people, Reel
-- settings, first comment) and the first comment's outcome.
ALTER TABLE "PlatformPost" ADD COLUMN "options" JSONB,
ADD COLUMN "firstCommentId" TEXT,
ADD COLUMN "firstCommentError" TEXT,
ADD COLUMN "firstCommentAt" TIMESTAMP(3);

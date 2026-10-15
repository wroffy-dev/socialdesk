-- Projects: a workspace holds projects; each project links at most one Instagram and one
-- Facebook account, and every post belongs to a project. Plans now limit projects instead of
-- connected channels.

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");
CREATE UNIQUE INDEX "Project_workspaceId_name_key" ON "Project"("workspaceId", "name");
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pending OAuth flows are short-lived; drop them instead of guessing a project.
DELETE FROM "OAuthState";
DELETE FROM "PendingConnection";

ALTER TABLE "OAuthState" ADD COLUMN "platform" "SocialPlatform" NOT NULL, ADD COLUMN "projectId" TEXT NOT NULL;
ALTER TABLE "PendingConnection" ADD COLUMN "platform" "SocialPlatform" NOT NULL, ADD COLUMN "projectId" TEXT NOT NULL;
ALTER TABLE "SocialAccount" ADD COLUMN "projectId" TEXT;
ALTER TABLE "SocialPost" ADD COLUMN "projectId" TEXT;

-- Existing data: the n-th active account of a platform in a workspace goes to project n
-- (project 1 is named after the workspace). Disconnected accounts go to project 1.
CREATE TEMP TABLE "_acc_rank" AS
SELECT a."id", a."workspaceId",
       CASE WHEN a."status" = 'DISCONNECTED' THEN 1
            ELSE row_number() OVER (PARTITION BY a."workspaceId", a."platform", (a."status" = 'DISCONNECTED') ORDER BY a."createdAt", a."id")
       END AS "rn"
FROM "SocialAccount" a;

CREATE TEMP TABLE "_proj" AS
SELECT w."id" AS "workspaceId", 1::bigint AS "rn", w."name" AS "name", replace(gen_random_uuid()::text, '-', '') AS "id"
FROM "Workspace" w
UNION ALL
SELECT r."workspaceId", r."rn", w."name" || ' ' || r."rn", replace(gen_random_uuid()::text, '-', '')
FROM (SELECT DISTINCT "workspaceId", "rn" FROM "_acc_rank" WHERE "rn" > 1) r
JOIN "Workspace" w ON w."id" = r."workspaceId";

-- Later projects get later timestamps so they list in order, and each gets its own colour.
INSERT INTO "Project" ("id", "workspaceId", "name", "color", "createdAt", "updatedAt")
SELECT "id", "workspaceId", "name",
       (ARRAY['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'])[(("rn" - 1) % 8) + 1],
       CURRENT_TIMESTAMP + ("rn" - 1) * INTERVAL '1 second', CURRENT_TIMESTAMP
FROM "_proj";

UPDATE "SocialAccount" a SET "projectId" = p."id"
FROM "_acc_rank" r JOIN "_proj" p ON p."workspaceId" = r."workspaceId" AND p."rn" = r."rn"
WHERE a."id" = r."id";

-- A post joins the project of its first channel version, or the workspace's first project.
UPDATE "SocialPost" sp SET "projectId" = (
  SELECT a."projectId" FROM "PlatformPost" v JOIN "SocialAccount" a ON a."id" = v."socialAccountId"
  WHERE v."postId" = sp."id" ORDER BY v."createdAt", v."id" LIMIT 1
);
UPDATE "SocialPost" sp SET "projectId" = p."id"
FROM "_proj" p WHERE sp."projectId" IS NULL AND p."workspaceId" = sp."workspaceId" AND p."rn" = 1;

DROP TABLE "_acc_rank";
DROP TABLE "_proj";

ALTER TABLE "SocialAccount" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "SocialPost" ALTER COLUMN "projectId" SET NOT NULL;

CREATE INDEX "SocialAccount_projectId_platform_idx" ON "SocialAccount"("projectId", "platform");
CREATE INDEX "SocialPost_workspaceId_projectId_idx" ON "SocialPost"("workspaceId", "projectId");

ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PendingConnection" ADD CONSTRAINT "PendingConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Plans: Starter becomes Pro, the old Pro becomes Business (keys, names and subscriptions move with them).
UPDATE "Plan" SET "key" = 'business', "name" = 'Business', "description" = 'For growing teams with several brands.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'pro' AND EXISTS (SELECT 1 FROM "Plan" WHERE "key" = 'starter');
UPDATE "Plan" SET "key" = 'pro', "name" = 'Pro', "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = 'starter';

-- Project limits replace the connected-channel limit.
INSERT INTO "Entitlement" ("id", "planId", "key", "limit", "enabled")
SELECT replace(gen_random_uuid()::text, '-', ''), p."id", 'projects',
       CASE p."key" WHEN 'free' THEN 2 WHEN 'pro' THEN 5 WHEN 'business' THEN 10 WHEN 'agency' THEN 20 ELSE 2 END,
       true
FROM "Plan" p
ON CONFLICT ("planId", "key") DO NOTHING;
DELETE FROM "Entitlement" WHERE "key" = 'social_accounts';

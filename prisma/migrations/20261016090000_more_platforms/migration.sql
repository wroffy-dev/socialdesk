-- X, LinkedIn and YouTube channels: new platforms and formats, refresh tokens (these providers
-- issue short-lived access tokens) and the PKCE verifier for X's OAuth flow.
ALTER TYPE "SocialPlatform" ADD VALUE 'X';
ALTER TYPE "SocialPlatform" ADD VALUE 'LINKEDIN';
ALTER TYPE "SocialPlatform" ADD VALUE 'YOUTUBE';

ALTER TYPE "PostFormat" ADD VALUE 'VIDEO';
ALTER TYPE "PostFormat" ADD VALUE 'SHORT';

ALTER TABLE "SocialAccount" ADD COLUMN "refreshTokenEnc" TEXT,
ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP(3);

ALTER TABLE "OAuthState" ADD COLUMN "codeVerifierEnc" TEXT;

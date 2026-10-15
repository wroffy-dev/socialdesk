-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN     "baseMediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

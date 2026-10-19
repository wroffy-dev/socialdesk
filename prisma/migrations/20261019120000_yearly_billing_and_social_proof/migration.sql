-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "razorpayYearlyPlanId" TEXT,
ADD COLUMN     "yearlyPriceAmount" INTEGER;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "interval" TEXT NOT NULL DEFAULT 'month';

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT,
    "company" TEXT,
    "avatarUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLogo" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "websiteUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerLogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Testimonial_isPublished_sortOrder_idx" ON "Testimonial"("isPublished", "sortOrder");

-- CreateIndex
CREATE INDEX "CustomerLogo_isPublished_sortOrder_idx" ON "CustomerLogo"("isPublished", "sortOrder");


-- Default yearly price for existing paid plans: 10 months (two months free). Editable in the admin panel.
UPDATE "Plan" SET "yearlyPriceAmount" = "priceAmount" * 10 WHERE "priceAmount" > 0 AND "yearlyPriceAmount" IS NULL;

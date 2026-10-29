-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "accentColor" TEXT DEFAULT '#FF2E93',
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "brandHero" TEXT DEFAULT 'Curated finds for everyday life',
ADD COLUMN     "tagline" TEXT;

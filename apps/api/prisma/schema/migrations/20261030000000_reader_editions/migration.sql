-- CreateEnum
CREATE TYPE "reader_edition_length" AS ENUM ('short', 'standard', 'long');

-- CreateEnum
CREATE TYPE "reader_edition_figures" AS ENUM ('key', 'all', 'none');

-- AlterTable
ALTER TABLE "reader_book" ADD COLUMN     "irStorageKey" TEXT,
ADD COLUMN     "language" TEXT;

-- CreateTable
CREATE TABLE "reader_edition" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "length" "reader_edition_length" NOT NULL DEFAULT 'standard',
    "figures" "reader_edition_figures" NOT NULL DEFAULT 'key',
    "jobId" TEXT,
    "editionBookId" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reader_edition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reader_edition_bookId_createdAt_idx" ON "reader_edition"("bookId", "createdAt");

-- CreateIndex
CREATE INDEX "reader_edition_jobId_idx" ON "reader_edition"("jobId");

-- AddForeignKey
ALTER TABLE "reader_edition" ADD CONSTRAINT "reader_edition_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "reader_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_edition" ADD CONSTRAINT "reader_edition_editionBookId_fkey" FOREIGN KEY ("editionBookId") REFERENCES "reader_book"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_edition" ADD CONSTRAINT "reader_edition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

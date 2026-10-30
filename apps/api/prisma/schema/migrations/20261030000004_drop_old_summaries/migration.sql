-- The old summarizer goes (roadmap 2.7); the abridged editions replace it. On 2026-10-30 production
-- had no reader_summary rows, and no reader.extract job had ever run there, so nothing is lost.
-- DropForeignKey
ALTER TABLE "reader_summary" DROP CONSTRAINT "reader_summary_bookId_fkey";

-- DropForeignKey
ALTER TABLE "reader_summary" DROP CONSTRAINT "reader_summary_userId_fkey";

-- AlterTable
ALTER TABLE "reader_book" DROP COLUMN "extractionStorageKey";

-- DropTable
DROP TABLE "reader_summary";

-- DropEnum
DROP TYPE "reader_summarization_strategy";

-- DropEnum
DROP TYPE "reader_summary_type";

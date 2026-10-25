-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "reader_book_status" AS ENUM ('ready', 'error');

-- CreateEnum
CREATE TYPE "reader_summary_type" AS ENUM ('extractive', 'abstractive');

-- CreateEnum
CREATE TYPE "reader_summarization_strategy" AS ENUM ('basic', 'structured', 'two_pass', 'chain_of_density', 'hybrid');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "stage" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "waitReason" TEXT,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "workerId" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "parentJobId" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reader_book" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "description" TEXT,
    "customCoverStorageKey" TEXT,
    "spentTime" INTEGER NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "pagePassCount" INTEGER NOT NULL DEFAULT 0,
    "isFinished" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "mime" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT,
    "fileStorageKey" TEXT NOT NULL,
    "status" "reader_book_status" NOT NULL DEFAULT 'ready',
    "errorMessage" TEXT,
    "extractionStorageKey" TEXT,
    "lastAccessed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readingPosition" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reader_book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reader_summary" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "reader_summary_type" NOT NULL,
    "strategy" "reader_summarization_strategy" NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "storageKey" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reader_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reader_note" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "anchor" JSONB,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "reader_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reader_highlight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "color" TEXT,
    "text" TEXT NOT NULL,
    "anchor" JSONB NOT NULL,
    "noteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "reader_highlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "Job_userId_status_createdAt_idx" ON "Job"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_subjectType_subjectId_idx" ON "Job"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "Job_status_heartbeatAt_idx" ON "Job"("status", "heartbeatAt");

-- CreateIndex
CREATE INDEX "Job_parentJobId_idx" ON "Job"("parentJobId");

-- CreateIndex
CREATE INDEX "reader_book_userId_updatedAt_idx" ON "reader_book"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "reader_summary_bookId_createdAt_idx" ON "reader_summary"("bookId", "createdAt");

-- CreateIndex
CREATE INDEX "reader_summary_jobId_idx" ON "reader_summary"("jobId");

-- CreateIndex
CREATE INDEX "reader_note_userId_bookId_createdAt_idx" ON "reader_note"("userId", "bookId", "createdAt");

-- CreateIndex
CREATE INDEX "reader_highlight_userId_bookId_createdAt_idx" ON "reader_highlight"("userId", "bookId", "createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_book" ADD CONSTRAINT "reader_book_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_summary" ADD CONSTRAINT "reader_summary_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "reader_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_summary" ADD CONSTRAINT "reader_summary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_note" ADD CONSTRAINT "reader_note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_note" ADD CONSTRAINT "reader_note_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "reader_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_highlight" ADD CONSTRAINT "reader_highlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_highlight" ADD CONSTRAINT "reader_highlight_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "reader_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_highlight" ADD CONSTRAINT "reader_highlight_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "reader_note"("id") ON DELETE SET NULL ON UPDATE CASCADE;


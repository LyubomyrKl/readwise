-- CreateTable
CREATE TABLE "money_oauth_code" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'read',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_oauth_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "money_oauth_code_codeHash_key" ON "money_oauth_code"("codeHash");

-- CreateIndex
CREATE INDEX "money_oauth_code_userId_idx" ON "money_oauth_code"("userId");

-- AddForeignKey
ALTER TABLE "money_oauth_code" ADD CONSTRAINT "money_oauth_code_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

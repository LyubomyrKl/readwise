-- Claude's connector tokens expire and are renewed with a refresh token; every
-- token remembers the address it was last used from. Existing tokens keep
-- expiresAt null: they do not expire.

-- AlterTable
ALTER TABLE "money_api_token" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "lastUsedIp" TEXT,
ADD COLUMN     "oauthClientId" TEXT,
ADD COLUMN     "refreshExpiresAt" TIMESTAMP(3),
ADD COLUMN     "refreshTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "money_api_token_refreshTokenHash_key" ON "money_api_token"("refreshTokenHash");

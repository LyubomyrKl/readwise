-- Finish lines: a net worth the person wants to reach, in its own currency (Insights). Above zero.
-- CreateTable
CREATE TABLE "money_goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "currencyId" TEXT NOT NULL,
    "targetMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_goal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "money_goal_userId_idx" ON "money_goal"("userId");

-- AddForeignKey
ALTER TABLE "money_goal" ADD CONSTRAINT "money_goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_goal" ADD CONSTRAINT "money_goal_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "money_commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- a finish line is above zero
ALTER TABLE "money_goal" ADD CONSTRAINT "money_goal_target_positive" CHECK ("targetMinor" > 0);

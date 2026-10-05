-- Price watch: the recurring comparison of the Datees Shop catalogue against our own variants.
--
-- The SQL is what `prisma migrate dev` emits for this schema, generated rather than typed, so the
-- statements are in the same order and wording the tool produces for the same three models. It is
-- committed as a file rather than produced here because the development database's role cannot
-- create a shadow database, which is what `migrate dev` replays the migrations onto; `migrate
-- deploy` applies the same file and `scripts/check-migrations.sh`'s drift check replays every
-- migration onto a disposable cluster and diffs the result against the schema.

-- CreateEnum
CREATE TYPE "PriceWatchMode" AS ENUM ('INTERVAL', 'DAILY');

-- CreateEnum
CREATE TYPE "PriceWatchRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PriceWatchTrigger" AS ENUM ('SCHEDULE', 'MANUAL');

-- CreateEnum
CREATE TYPE "PriceChangeStatus" AS ENUM ('PENDING', 'APPLIED', 'IGNORED');

-- CreateTable
CREATE TABLE "PriceWatch" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" "PriceWatchMode" NOT NULL DEFAULT 'INTERVAL',
    "intervalMinutes" INTEGER NOT NULL DEFAULT 360,
    "dailyAt" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceWatchRun" (
    "id" TEXT NOT NULL,
    "status" "PriceWatchRunStatus" NOT NULL,
    "trigger" "PriceWatchTrigger" NOT NULL,
    "quotes" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "changes" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PriceWatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "colorName" TEXT NOT NULL,
    "fromPrice" DOUBLE PRECISION NOT NULL,
    "toPrice" DOUBLE PRECISION NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" "PriceChangeStatus" NOT NULL DEFAULT 'PENDING',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "appliedById" TEXT,

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceWatchRun_startedAt_idx" ON "PriceWatchRun"("startedAt");

-- CreateIndex
CREATE INDEX "PriceChange_status_detectedAt_idx" ON "PriceChange"("status", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceChange_runId_variantId_key" ON "PriceChange"("runId", "variantId");

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PriceWatchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

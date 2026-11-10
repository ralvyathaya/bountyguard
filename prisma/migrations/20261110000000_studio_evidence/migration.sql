-- AlterTable
ALTER TABLE "Bounty" ADD COLUMN     "evidencePolicy" JSONB;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "contributorCountry" TEXT,
ADD COLUMN     "sourceKind" TEXT NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "sourceUrl" TEXT;

-- CreateTable
CREATE TABLE "EvidenceSnapshot" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "headSha" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "data" JSONB NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedDashboard" (
    "id" TEXT NOT NULL DEFAULT 'workspace',
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedDashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "dataMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "modelCalls" INTEGER NOT NULL DEFAULT 0,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "events" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceSnapshot_submissionId_key" ON "EvidenceSnapshot"("submissionId");

-- CreateIndex
CREATE INDEX "AgentRun_sessionHash_createdAt_idx" ON "AgentRun"("sessionHash", "createdAt");

-- AddForeignKey
ALTER TABLE "EvidenceSnapshot" ADD CONSTRAINT "EvidenceSnapshot_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;


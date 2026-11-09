CREATE TABLE "Bounty" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "criteria" JSONB NOT NULL,
  "rewardCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "autoMinScore" INTEGER NOT NULL DEFAULT 90,
  "autoMaxCents" INTEGER NOT NULL DEFAULT 5000,
  "currentSubmissionId" TEXT,
  "auditClaim" TEXT,
  "auditStartedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Bounty_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Bounty_reward_check" CHECK ("rewardCents" > 0 AND "rewardCents" <= 100000000 AND "currency" = 'USD'),
  CONSTRAINT "Bounty_policy_check" CHECK ("autoMinScore" BETWEEN 0 AND 100 AND "autoMaxCents" > 0)
);
CREATE TABLE "Submission" (
  "id" TEXT NOT NULL,
  "bountyId" TEXT NOT NULL,
  "receiverEmail" TEXT NOT NULL,
  "deliverable" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditRun" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "verdict" JSONB,
  "steps" JSONB,
  "model" TEXT NOT NULL,
  "receiverEmail" TEXT NOT NULL,
  "durationMs" INTEGER,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AuditRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Funding" (
  "id" TEXT NOT NULL,
  "bountyId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "captureKey" TEXT NOT NULL,
  "orderId" TEXT,
  "captureId" TEXT,
  "amountCents" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATING',
  "receipt" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Funding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Funding_amount_check" CHECK ("amountCents" > 0)
);
CREATE TABLE "Payout" (
  "id" TEXT NOT NULL,
  "bountyId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "auditId" TEXT NOT NULL,
  "receiverEmail" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "senderBatchId" TEXT NOT NULL,
  "batchId" TEXT,
  "transactionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "provider" TEXT NOT NULL DEFAULT 'PAYPAL_SANDBOX',
  "settlementMode" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "receipt" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payout_amount_check" CHECK ("amountCents" > 0)
);
CREATE TABLE "LedgerEvent" (
  "id" TEXT NOT NULL,
  "bountyId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LoginLimit" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoginLimit_pkey" PRIMARY KEY ("key")
);
CREATE UNIQUE INDEX "Bounty_currentSubmissionId_key" ON "Bounty"("currentSubmissionId");
CREATE INDEX "Submission_bountyId_idx" ON "Submission"("bountyId");
CREATE INDEX "AuditRun_submissionId_createdAt_idx" ON "AuditRun"("submissionId", "createdAt");
CREATE UNIQUE INDEX "Funding_bountyId_key" ON "Funding"("bountyId");
CREATE UNIQUE INDEX "Funding_requestId_key" ON "Funding"("requestId");
CREATE UNIQUE INDEX "Funding_captureKey_key" ON "Funding"("captureKey");
CREATE UNIQUE INDEX "Funding_orderId_key" ON "Funding"("orderId");
CREATE UNIQUE INDEX "Funding_captureId_key" ON "Funding"("captureId");
CREATE UNIQUE INDEX "Payout_bountyId_key" ON "Payout"("bountyId");
CREATE UNIQUE INDEX "Payout_senderBatchId_key" ON "Payout"("senderBatchId");
CREATE UNIQUE INDEX "Payout_batchId_key" ON "Payout"("batchId");
CREATE UNIQUE INDEX "Payout_transactionId_key" ON "Payout"("transactionId");
CREATE INDEX "LedgerEvent_bountyId_createdAt_idx" ON "LedgerEvent"("bountyId", "createdAt");
ALTER TABLE "Bounty" ADD CONSTRAINT "Bounty_currentSubmissionId_fkey" FOREIGN KEY ("currentSubmissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "Bounty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditRun" ADD CONSTRAINT "AuditRun_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Funding" ADD CONSTRAINT "Funding_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "Bounty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "Bounty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerEvent" ADD CONSTRAINT "LedgerEvent_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "Bounty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { db, json } from "../lib/db";
import { settleBounty } from "../lib/bounty-service";

test(
  "Neon: concurrent release requests create exactly one payout and stale recipients are blocked",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.PAYPAL_CLIENT_ID = `integration-${randomUUID()}`;
    process.env.PAYPAL_CLIENT_SECRET = "integration-test-only";
    process.env.PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";
    const originalFetch = globalThis.fetch;
    let payoutCalls = 0;
    let fundingReads = 0;
    let bountyId = "";
    const orderId = `TESTORDER${randomUUID().replaceAll("-", "")}`;
    const captureId = `TESTCAPTURE${randomUUID().replaceAll("-", "")}`;
    globalThis.fetch = async (input) => {
      if (String(input).endsWith("/v1/oauth2/token"))
        return Response.json({ access_token: "test-token", expires_in: 300 });
      if (String(input).includes("/v2/checkout/orders/")) {
        fundingReads++;
        return Response.json({ id: orderId, status: "COMPLETED", purchase_units: [{ reference_id: bountyId, custom_id: bountyId, payments: { captures: [{ id: captureId, status: "COMPLETED", final_capture: true, amount: { currency_code: "USD", value: "35.00" } }] } }] });
      }
      if (String(input).includes("/v2/payments/captures/")) {
        fundingReads++;
        return Response.json({ id: captureId, status: "COMPLETED", amount: { currency_code: "USD", value: "35.00" } });
      }
      payoutCalls++;
      return Response.json({
        batch_header: {
          payout_batch_id: `TESTBATCH${randomUUID().replaceAll("-", "")}`,
        },
      });
    };
    const bounty = await db().bounty.create({
      data: {
        title: "Integration test only",
        criteria: [{ id: "tests", text: "Tests included" }],
        rewardCents: 3500,
        funding: {
          create: {
            requestId: randomUUID(),
            captureKey: randomUUID(),
            amountCents: 3500,
            status: "COMPLETED",
            orderId,
            captureId,
          },
        },
      },
    });
    bountyId = bounty.id;
    try {
      const submission = await db().submission.create({
        data: {
          bountyId: bounty.id,
          receiverEmail: "dev@example.test",
          deliverable: "Complete implementation and regression tests.",
        },
      });
      await db().bounty.update({
        where: { id: bounty.id },
        data: { currentSubmissionId: submission.id },
      });
      await db().auditRun.create({
        data: {
          submissionId: submission.id,
          model: "test",
          receiverEmail: "different@example.test",
          status: "COMPLETED",
          verdict: json({
            score: 96,
            status: "APPROVED",
            criteriaBreakdown: [
              {
                criterionId: "tests",
                passed: true,
                evidence: "Tests supplied",
                feedback: "Pass",
              },
            ],
            reasoning: "Verified fixture",
            riskFlags: [],
          }),
        },
      });
      await assert.rejects(
        settleBounty(bounty.id, submission.id, true),
        /policy blocked/,
      );
      await db().auditRun.updateMany({
        where: { submissionId: submission.id },
        data: { receiverEmail: submission.receiverEmail },
      });
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          settleBounty(bounty.id, submission.id, true),
        ),
      );
      assert.ok(results.every((result) => result.status === "fulfilled"));
      assert.equal(
        await db().payout.count({ where: { bountyId: bounty.id } }),
        1,
      );
      assert.equal(payoutCalls, 1);
      assert.ok(fundingReads >= 2, "Release must recheck authoritative funding before a payout claim");
    } finally {
      globalThis.fetch = originalFetch;
      await db().bounty.delete({ where: { id: bounty.id } });
      await db().$disconnect();
    }
  },
);

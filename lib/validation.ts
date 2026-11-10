import { z } from "zod";

export const criterionSchema = z
  .object({
    id: z.string().min(1).max(64),
    text: z.string().trim().min(3).max(1000),
  })
  .strict();
export const criteriaSchema = z
  .array(criterionSchema)
  .min(1)
  .max(20)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "Criterion IDs must be unique.",
  );
export const evidencePolicySchema = z.object({
  repository: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/).max(200),
  baseBranch: z.string().min(1).max(200).default("main"),
  requiredChecks: z.array(z.object({
    name: z.string().min(1).max(160),
    appSlug: z.string().regex(/^[a-zA-Z0-9-]+$/).max(100),
    workflowPath: z.string().regex(/^\.github\/workflows\/[a-zA-Z0-9_.-]+\.ya?ml$/).optional(),
  }).strict()).min(1).max(10),
}).strict();
export const bountySchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    criteria: criteriaSchema,
    reward: z.string().max(16),
    autoMinScore: z.number().int().min(0).max(100).default(90),
    autoMaxReward: z.string().max(16).default("50.00"),
    evidencePolicy: evidencePolicySchema.optional(),
  })
  .strict();
export const submissionSchema = z
  .object({
    receiverEmail: z
      .string()
      .trim()
      .email()
      .max(127)
      .refine(
        (v) => /^[\x20-\x7E]+$/.test(v),
        "PayPal requires an ASCII email address.",
      ),
    deliverable: z.string().trim().min(20).max(80000),
    sourceKind: z.enum(["TEXT", "GITHUB_PR"]).default("TEXT"),
    sourceUrl: z.string().url().max(300).optional(),
    contributorCountry: z.string().regex(/^[A-Z]{2}$/).optional(),
  })
  .strict();
export const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const bountyIdSchema = z.object({ bountyId: idSchema }).strict();
export const auditInputSchema = z.object({ submissionId: idSchema }).strict();
export const payoutInputSchema = z
  .object({ bountyId: idSchema, submissionId: idSchema })
  .strict();
export const verdictSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    status: z.enum(["APPROVED", "REVISION_REQUIRED"]),
    criteriaBreakdown: z
      .array(
        z
          .object({
            criterionId: z.string().min(1).max(64),
            passed: z.boolean(),
            evidence: z.string().max(4000),
            feedback: z.string().max(4000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    reasoning: z.string().min(1).max(8000),
    riskFlags: z.array(z.string().min(1).max(1000)).max(20),
  })
  .strict();

export const demoLedgerSchema = z
  .array(
    z.object({
      id: idSchema,
      title: z.string().max(160),
      criteria: criteriaSchema,
      rewardCents: z.number().int().positive().max(100000000),
      autoMinScore: z.number().int().min(0).max(100),
      autoMaxCents: z.number().int().positive(),
      createdAt: z.string(),
      submission: z
        .object({
          id: idSchema,
          receiverEmail: z.string(),
          deliverable: z.string().max(80000),
          createdAt: z.string(),
        })
        .nullable(),
      audit: z
        .object({
          id: idSchema,
          status: z.string(),
          verdict: verdictSchema.nullable(),
          steps: z.array(
            z.object({ name: z.string(), verdict: verdictSchema }),
          ),
          model: z.string(),
          durationMs: z.number().nullable(),
          error: z.string().nullable(),
          completedAt: z.string().nullable(),
        })
        .nullable(),
      funding: z
        .object({
          status: z.string(),
          orderId: z.string().nullable(),
          captureId: z.string().nullable(),
          amountCents: z.number().int(),
        })
        .nullable(),
      payout: z
        .object({
          id: idSchema,
          status: z.string(),
          provider: z.string(),
          settlementMode: z.string(),
          batchId: z.string().nullable(),
          transactionId: z.string().nullable(),
          error: z.string().nullable(),
          receipt: z.unknown(),
        })
        .nullable(),
      events: z
        .array(
          z.object({
            id: z.string(),
            type: z.string(),
            message: z.string(),
            createdAt: z.string(),
          }),
        )
        .max(500),
    }),
  )
  .max(500);

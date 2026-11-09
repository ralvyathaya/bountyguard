# BountyGuard

**Work verified. Rewards released.** An autonomous micro-bounty command center built for the PayPal AI Hackathon.

Maintainers fund USD bounties with PayPal Sandbox Checkout. An auditor evaluates submitted evidence, challenges its own evaluation, and applies a server-enforced release policy. AG Grid presents the financial ledger, audit scores, criteria, and receipts.

## Run the judge demo

Requires Node.js **22.18+** and npm.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). No credentials or database are needed for **Judge demo**.

| Scenario                 | What to click               | What to see                                                                   |
| ------------------------ | --------------------------- | ----------------------------------------------------------------------------- |
| A: $35 bugfix            | Good work. Instant reward.  | 96/100, all criteria pass, automatic simulated receipt                        |
| B: incomplete submission | No tests. No payout.        | Missing regression tests, revision feedback, release blocked                  |
| C: $250 architecture     | Big reward. Human decision. | 92/100, awaiting approval; click Approve release to record the human decision |

The inspector shows per-criterion evidence, both audit steps, policy decisions, events, and receipts. Search/filter the AG Grid ledger and export its visible filtered rows to CSV. Reset demo restores the seeded state in this browser.

Demo fixtures and localStorage are isolated from the connected database. Demo scores are deterministic, not responses from an LLM. All demo and permission-fallback receipts are labeled **Simulated** and use `SIM-` transaction IDs.

## Configure Sandbox Connected

1. Copy `.env.example` to `.env.local` and supply actual server credentials. Never commit `.env.local`.
2. Create a Neon Postgres database. Put its pooled URL in `DATABASE_URL` and its direct URL in `DIRECT_URL`.
3. Set a random `MAINTAINER_PASSWORD` with at least 16 characters and a separate random `SESSION_SECRET` with at least 32 characters.
4. Apply the committed migration, then optionally seed three **unfunded** task templates:

   ```sh
   npm run db:migrate
   npm run db:seed
   ```

5. Restart the app and select **Sandbox connected**. Sign in with the maintainer password.

Prisma CLI and seed scripts read `.env.local` / `.env` using Node's built-in environment loader. The app loads environment files through Next.js. Existing environment variables take precedence. Builds generate Prisma Client without connecting to a database or requiring secrets.

### Custom OpenAI-compatible model

```dotenv
OPENAI_API_KEY="your-provider-key"
OPENAI_BASE_URL="https://your-provider.example/v1"
OPENAI_MODEL="your-model-id"
```

The SDK calls **`POST {OPENAI_BASE_URL}/chat/completions`** with `model` and `messages`. Include `/v1` only if your provider requires it. There is no fallback to OpenAI's endpoint or default model. The adapter does not require provider tools, Responses API, JSON mode, or JSON Schema support. HTTPS is required; HTTP localhost is allowed in development.

The first call evaluates every criterion; the second independently reviews it. JSON is validated with Zod, and every criterion ID must occur exactly once. The final score is the lower score, criterion passes require agreement, and any risk flag blocks release. At most one JSON repair call is allowed across the audit. Each call has a 25-second timeout and no automatic SDK retries. The audit route allows 120 seconds on Vercel.

The model returns:

```ts
type AuditVerdict = {
  score: number; // integer 0–100
  status: "APPROVED" | "REVISION_REQUIRED";
  criteriaBreakdown: {
    criterionId: string;
    passed: boolean;
    evidence: string;
    feedback: string;
  }[];
  reasoning: string;
  riskFlags: string[];
};
```

M1 evaluates **pasted text evidence**: code diffs, Markdown, tests, and structured descriptions. It does not run submitted code or fetch arbitrary URLs. A link alone cannot substantiate an acceptance criterion. Evidence summaries are persisted; private model chain-of-thought is not requested.

### PayPal Sandbox

Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` from a PayPal developer **Sandbox business app**, with:

```dotenv
PAYPAL_BASE_URL="https://api-m.sandbox.paypal.com"
```

Any other PayPal host is rejected. Use a separate sandbox buyer account to approve Checkout and a sandbox receiver email for submissions. BountyGuard exposes only the client ID to the authenticated Checkout component; client secrets and OAuth tokens remain server-side.

- OAuth uses `/v1/oauth2/token` with `client_credentials`; tokens are cached until shortly before expiry.
- Orders are created/captured server-side using the database reward and immutable bounty reference. Only a verified completed capture funds a bounty.
- “Escrow” means an application ledger reserve against a captured sandbox merchant payment. It is not a regulated escrow account or an API transfer from an individual capture into Payouts. Payouts use the sender's sandbox account balance and permissions.
- Auto-release defaults to **all criteria passed, no risks, score ≥90, reward ≤$50**, and confirmed funding. Other approved submissions require maintainer approval. Rejected work cannot be manually overridden.
- Each bounty has one persisted payout operation with a stable `sender_batch_id`. Serializable database transactions, unique constraints, and immutable submission/recipient snapshots prevent duplicate releases and stale approvals.
- A batch-created response remains **pending**. Only a verified payout item's `SUCCESS` produces **Settled**. Pending/unknown statuses are reconciled while the connected dashboard is open and can be refreshed from the inspector. PayPal may return unclaimed, denied, returned, or other non-success statuses.
- Recognized HTTP 403 Payouts permission errors produce a simulation receipt. That receipt does **not** spend the reserved ledger funds or count toward real autonomous payouts. Credentials, network failures, and insufficient balance never silently become successful simulations.
- Unknown submissions are retried/reconciled with the same operation key. No new batch is issued near the 30-day provider idempotency expiry. Definitively failed operations require inspection; this milestone does not invent a fresh payout retry or refund workflow.

## API

All connected endpoints require a signed maintainer cookie. POST requests also require a same-origin `Origin` header. The shared-password session lasts 8 hours and uses HttpOnly / SameSite=Strict / Secure cookies in production. Login attempts use a database-backed global 10-attempt bucket per 15 minutes.

| Method | Route                                  | Body / behavior                                                                               |
| ------ | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/login`                      | `{ password }`                                                                                |
| POST   | `/api/auth/logout`                     | Clears session                                                                                |
| GET    | `/api/auth/session`                    | Authentication status only                                                                    |
| GET    | `/api/config`                          | Client ID and missing setting names, never secrets                                            |
| GET    | `/api/bounties`                        | Ledger rows (latest 500 bounties)                                                             |
| POST   | `/api/bounties`                        | `{ title, criteria: [{id,text}], reward: "35.00", autoMinScore: 90, autoMaxReward: "50.00" }` |
| POST   | `/api/bounties/[id]/submissions`       | `{ receiverEmail, deliverable }`                                                              |
| POST   | `/api/agent/audit`                     | `{ submissionId }`; approved eligible work triggers settlement in the same request            |
| POST   | `/api/paypal/orders`                   | `{ bountyId }`; returns `{ orderId }`                                                         |
| POST   | `/api/paypal/orders/[orderId]/capture` | Verifies capture and records funding                                                          |
| POST   | `/api/paypal/payout`                   | `{ bountyId, submissionId }`; explicit maintainer approval                                    |
| POST   | `/api/paypal/payout/[id]/sync`         | Reconciles the existing provider operation                                                    |

Reward amounts, recipients, audits, thresholds, and settlement modes are reloaded from the database. Client-supplied payment amounts are rejected. Requests are limited to 128 KiB; deliverables to 80,000 characters. All connected responses use `Cache-Control: no-store`.

Money uses integer USD cents, then decimal strings at the PayPal boundary. Timestamps are stored in UTC and rendered in the viewer's local timezone. The ledger is a read-only financial view; immutable audit and financial records cannot be edited inline.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm start
```

The Node test runner covers threshold boundaries, stale submissions/recipients, strict audit validation, custom endpoint calls, conservative aggregation, prompt-injection risk handling, bounded repair/retries, auth/Origin checks, capture mismatches, payout fallbacks, pending/success distinctions, money, CSV formula injection, and all three judge paths. Network calls are mocked in these tests.

The Neon concurrency test is explicitly skipped without `TEST_DATABASE_URL`. To run it, use a **dedicated disposable Neon test database**, migrate it with its direct URL, and export its runtime URL as `TEST_DATABASE_URL` before running `npm test`. It creates/deletes only its own test bounty and mocks PayPal; no external payment is sent. Do not point it at a shared production database.

GitHub Actions runs typecheck, tests, and build on pushes to `main` and pull requests, without credentials.

## Deploy to Vercel

1. Import the GitHub repository into Vercel using the Next.js preset and Node.js 22.x.
2. The public judge demo can deploy with no environment variables.
3. For connected mode, add the `.env.example` settings in Vercel's server environment. Keep preview and production database credentials separate.
4. Apply `npm run db:migrate` explicitly against the intended Neon database **before** enabling connected mode. Do not run migrations or seed payments during `next build`.
5. Deploy, then verify the public presets and the protected connected flow using sandbox accounts. Keep Fluid Compute enabled for the 120-second audit route.

No live money, Invoicing, multi-user identity system, webhooks, arbitrary URL retrieval, or repository execution is included in M1. Without webhooks/background workers, the payment provider continues processing a submitted payout, while the application's stored status catches up when the dashboard or sync endpoint is used.

## Source map

- `app/page.tsx`: single-page composition root.
- `components/`: command center, AG Grid ledger, audit inspector, accessible native dialogs.
- `lib/agent-auditor.ts`: custom LLM evaluation and review.
- `lib/paypal.ts`: sandbox OAuth, Orders, Payouts, and provider verification.
- `lib/bounty-service.ts`: immutable submissions, audit claims, funding, transactional settlement.
- `prisma/`: Postgres schema, baseline migration, unfunded seeds.

Built with Next.js, TypeScript, Tailwind, Prisma/Neon, AG Grid Community, the OpenAI-compatible SDK, and PayPal Sandbox.

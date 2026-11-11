# M2 verification record

Verified on 11 November 2026 (UTC+7). Public fixtures, live model calls, mocked provider responses, and real provider transactions are separate evidence categories.

| Check | Result |
| --- | --- |
| `npm test` | 72 passed; 2 Neon tests skipped in the credential-free suite |
| Disposable Neon integration database | Both integration tests passed: five concurrent releases produced one mocked payout, stale receiver blocked, more than 500 bounties aggregated, stale report saves rejected, historical criteria counted once per submission, and judge projections redacted |
| Studio budgets on Neon | Run limit 20, judge session limit 30/hour, and workspace limit 200/day rejected calls before the mocked provider was contacted |
| Provider webhooks | Invalid signature rejected before writes; duplicate and out-of-order events preserved state; lost capture/payout writes returned retryable errors |
| Custom model audit | Real configured Chat Completions provider returned two valid audit stages for a small pasted-code example; no payment was requested |
| Live Studio adapter | Real provider and native coordinator → Lead → Widget created three chart widgets; one measured run completed in nine model calls |
| Browser | All three public presets, inspector, reset, source labels, CSV trigger, cross-filter to one bounty, drill-through, undo/redo and browser report save exercised |
| Responsive and keyboard | 1440 px desktop and 390 px mobile checked; no document overflow; native dialog retained keyboard focus |
| Slow analytics response | An older populated cohort was delayed six seconds; the newer empty cohort remained displayed after the older response completed |
| TypeScript and production build | `tsc --noEmit` and `npm run build` passed; local production server rendered Studio charts and custom widgets |
| Code review | Completed review run `20261111-001039-02342cad`; no unresolved findings after fixes. Adversarial review used a local agent fallback because the separate CLI peer lacked `jq` |

The additive Prisma migration was tested on a temporary Neon branch before application to the app database. No captured funding or payout records were seeded.

## Payment proof still required

The account owner chose to test payments later. No real Sandbox capture or successful payout item has been demonstrated. Completing Personal Sandbox Checkout and providing a Personal Sandbox receiver are required for this proof. Payouts permission and available Sandbox balance are not yet proven.

`SIM-*` receipts remain simulations and never count as actual settled Sandbox payouts. The demo video draft must preserve these labels and state the unverified payment boundary. It requires owner review before YouTube or Devpost upload.

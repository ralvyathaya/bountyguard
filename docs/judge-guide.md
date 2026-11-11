# BountyGuard judge guide

Open [BountyGuard](https://bountyguard.vercel.app). The public Judge Demo needs no credentials. It uses explicitly labelled fixtures and simulated payments; reset it freely without touching the connected database.

## Thirty-second path

1. Run **Good work. Instant reward.** Inspect the 96/100 evidence breakdown and simulated automatic release.
2. Run **No tests. No payout.** Inspect the failed regression-test criterion and blocked release.
3. Run **Big reward. Human decision.** The $250 reward pauses for approval. In public demo, approving creates a labelled simulation.
4. Open **Studio**. Explore Operations, Risk & Policy, and Settlement Proof. Cross-filter a chart or Decision Path, edit the layout, undo/redo, and save a browser-local report.
5. Ask the scripted assistant to build a dashboard. Its coordinator delegates through the real Studio harness; no model request or provider payment is sent in this mode.

## Try the real custom model

Select **Judge access** and use the judge password supplied in the private submission testing instructions. The public repository intentionally contains no login password or API credentials.

Judge sessions can query data, create dashboard widgets, simulate thresholds, and inspect receipts. They cannot create/audit submissions, fund bounties, release rewards, sync financial operations, or overwrite the maintainer's saved report.

The Studio source label distinguishes:

| Label | Data | Agent |
| --- | --- | --- |
| Demo data / Scripted agent | Browser fixtures | Deterministic SDK runner |
| Demo data / Live AI | Server fixtures | Configured custom Chat Completions model |
| PayPal Sandbox / Live AI | Connected ledger | Configured custom Chat Completions model |

Suggested live prompts:

- Build a dashboard showing funded rewards, blocked value, and approval bottlenecks.
- Why is this bounty blocked? Show the evidence.
- What changes if the auto-release limit becomes $100?
- Show rejected submissions by failed acceptance criterion.

Live judge access has bounded usage: 20 model calls per run, 30 per session/hour, and 200 per workspace/day. Errors and exhausted budgets stay visible. Live responses never silently become scripted answers.

## Read the proof correctly

The audit score is a model evaluation score, not a calibrated probability. GitHub evidence is tied to an immutable head SHA and configured CI publisher/workflow. A changed head or missing required check blocks release until resubmission.

Only a verified PayPal Sandbox payout item with `SUCCESS` is settled. A batch-created response is pending; `SIM-*` is simulated. Country is optional contributor-reported metadata. The audit packet links records and provider IDs; it is not a cryptographic certification.

The connected financial flow requires a maintainer and separate Sandbox buyer/receiver accounts. A sandbox capture reserves ledger funds; PayPal Payouts uses the merchant's sandbox balance and permissions.

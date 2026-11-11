# Public GitHub evidence lab

This isolated fixture supplies real PR diffs and real GitHub Actions results for BountyGuard's judge path. It is never imported by the financial application and never contacts PayPal.

The baseline function has a deliberate missing feature: duplicate delivery IDs are counted repeatedly. A $35 bounty asks for these criteria:

1. Deduplicate delivery IDs so replaying the same ID and amount cannot increase the total; reject a conflicting amount for an existing ID.
2. Include regression tests for duplicate replay, conflicting amounts, empty IDs, and invalid cents.
3. Document verification steps and limitations.

Run `node --test examples/evidence-lab/deliveries.test.mjs`.

Required CI policy: repository `ralvyathaya/bountyguard`, base branch `main`, check name `evidence-lab`, publisher `github-actions`, workflow `.github/workflows/evidence-lab.yml`.

Demo branches/PRs stay unmerged: a complete fix, a failing/incomplete proposal, and a complete proposal whose head can be advanced after audit to demonstrate stale-evidence blocking. The workflow checks out `github.event.pull_request.head.sha` rather than the synthetic merge SHA.

# Approved evidence fixture

This branch is an unmerged BountyGuard judging fixture, never application runtime code.

`node --test examples/evidence-lab/deliveries.test.mjs` covers identical replays, conflicting amounts, empty IDs, invalid cents, zero/empty batches, order and overflow. Seven checks passed locally before publication. CI must also pass on the exact submitted PR head SHA.

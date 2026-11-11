// Deliberately incomplete bounty fixture; never imported by the application.
export function summarizeDeliveries(deliveries) {
  const ids = [];
  let totalCents = 0;
  for (const delivery of deliveries) {
    if (!Number.isSafeInteger(delivery.amountCents) || delivery.amountCents < 0) {
      throw new RangeError("Use non-negative integer cents.");
    }
    ids.push(delivery.id);
    totalCents += delivery.amountCents;
  }
  return { ids, totalCents };
}

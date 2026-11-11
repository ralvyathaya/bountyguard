export function summarizeDeliveries(deliveries) {
  const amounts = new Map();
  let totalCents = 0;
  for (const delivery of deliveries) {
    if (typeof delivery.id !== "string" || !delivery.id.trim()) throw new TypeError("Delivery ID is required.");
    if (!Number.isSafeInteger(delivery.amountCents) || delivery.amountCents < 0) throw new RangeError("Use non-negative integer cents.");
    if (amounts.has(delivery.id)) {
      if (amounts.get(delivery.id) !== delivery.amountCents) throw new RangeError("Conflicting duplicate delivery amount.");
      continue;
    }
    const next = totalCents + delivery.amountCents;
    if (!Number.isSafeInteger(next)) throw new RangeError("Total exceeds safe integer cents.");
    amounts.set(delivery.id, delivery.amountCents);
    totalCents = next;
  }
  return { ids: [...amounts.keys()], totalCents };
}

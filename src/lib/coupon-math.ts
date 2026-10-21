export function allocateDiscountPaise(totalDiscountPaise: number, lines: { id: string; totalPaise: number }[]) {
  if (!Number.isSafeInteger(totalDiscountPaise) || totalDiscountPaise < 0) throw new Error("Discount must be non-negative integer paise.");
  const subtotal = lines.reduce((sum, line) => sum + line.totalPaise, 0);
  if (totalDiscountPaise > subtotal) throw new Error("Discount cannot exceed eligible item total.");
  if (totalDiscountPaise === 0 || subtotal === 0) return new Map<string, number>();
  const shares = lines.map((line, index) => {
    const exact = totalDiscountPaise * line.totalPaise / subtotal;
    return { id: line.id, paise: Math.floor(exact), remainder: exact - Math.floor(exact), index };
  });
  let remaining = totalDiscountPaise - shares.reduce((sum, share) => sum + share.paise, 0);
  const priority = [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; remaining > 0; i += 1, remaining -= 1) priority[i % priority.length].paise += 1;
  return new Map(shares.map((share) => [share.id, share.paise]));
}

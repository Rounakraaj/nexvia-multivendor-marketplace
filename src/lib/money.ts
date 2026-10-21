/** Converts a Prisma Decimal/string/number with at most two decimal places to integer paise. */
export function toPaise(value: { toString(): string } | string | number): number {
  const text = typeof value === "number" ? value.toFixed(2) : value.toString();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error("Money values must have at most two decimal places.");
  const paise = BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? "").padEnd(2, "0"));
  const signed = match[1] ? -paise : paise;
  const result = Number(signed);
  if (!Number.isSafeInteger(result)) throw new Error("The order total is too large.");
  return result;
}

export function paiseToDecimal(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new Error("Money value is outside the supported range.");
  const sign = paise < 0 ? "-" : "";
  const absolute = Math.abs(paise);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/** Rounds commission to the nearest paisa; exact half-paise ties round upward. */
export function splitCommission(lineTotalPaise: number, ratePercent: number) {
  if (!Number.isSafeInteger(lineTotalPaise) || lineTotalPaise < 0) throw new Error("Line total must be non-negative integer paise.");
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 50 || !Number.isInteger(ratePercent * 2)) {
    throw new Error("Commission rate must be from 0 to 50 in steps of 0.5.");
  }
  const rateHalfPercent = BigInt(Math.round(ratePercent * 2));
  const commission = Number((BigInt(lineTotalPaise) * rateHalfPercent + BigInt(100)) / BigInt(200));
  return { commissionPaise: commission, vendorEarningPaise: lineTotalPaise - commission };
}

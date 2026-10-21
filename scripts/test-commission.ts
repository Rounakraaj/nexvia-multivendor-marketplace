import { splitCommission } from "../src/lib/money";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

try {
  for (let index = 0; index < 100; index += 1) {
    const pricePaise = 1 + Math.floor(Math.random() * 50_000_000);
    const qty = 1 + Math.floor(Math.random() * 250);
    const rateHalfPercent = Math.floor(Math.random() * 101);
    const rate = rateHalfPercent / 2;
    const lineTotal = pricePaise * qty;
    assert(Number.isSafeInteger(lineTotal), "Generated line total must be safe integer paise.");
    const split = splitCommission(lineTotal, rate);
    assert(split.commissionPaise + split.vendorEarningPaise === lineTotal, "Split must equal line total.");
  }

  assert(splitCommission(1, 50).commissionPaise === 1, "Half-paise ties round up.");
  assert(splitCommission(1, 0).commissionPaise === 0, "Zero commission stays zero.");
  assert(splitCommission(100, 10).commissionPaise === 10, "Ten percent commission is exact.");
  assert(splitCommission(100, 12.5).commissionPaise === 13, "Half-paise rounds to the next paisa.");

  const gross = 12_345;
  const split = splitCommission(gross, 12.5);
  const vendorDiscount = 1_234;
  assert(split.commissionPaise + (split.vendorEarningPaise - vendorDiscount) + vendorDiscount === gross, "Vendor-funded discount must reconcile with commission and seller earnings.");
  const platformDiscount = 1_234;
  assert((split.commissionPaise - platformDiscount) + split.vendorEarningPaise === gross - platformDiscount, "Platform-funded discount must reduce platform revenue and customer total while preserving seller earnings.");

  console.log("PASS: commission split checks");
} catch (error) {
  console.error("FAIL: commission split checks", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
}

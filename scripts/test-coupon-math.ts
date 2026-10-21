import assert from "node:assert/strict";
import { allocateDiscountPaise } from "../src/lib/coupon-math";

const equalLines = allocateDiscountPaise(1, [{ id: "a", totalPaise: 100 }, { id: "b", totalPaise: 100 }]);
assert.equal(equalLines.get("a"), 1);
assert.equal(equalLines.get("b"), 0);
const uneven = allocateDiscountPaise(7, [{ id: "a", totalPaise: 3 }, { id: "b", totalPaise: 4 }, { id: "c", totalPaise: 3 }]);
assert.equal([...uneven.values()].reduce((sum, value) => sum + value, 0), 7);
assert.throws(() => allocateDiscountPaise(11, [{ id: "a", totalPaise: 10 }]));
console.log("PASS: coupon discount allocation");

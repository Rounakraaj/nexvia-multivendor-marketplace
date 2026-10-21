import assert from "node:assert/strict";
import { canTransitionOrder } from "../src/lib/order-lifecycle";

assert.equal(canTransitionOrder("PAID", "PACKED"), true);
assert.equal(canTransitionOrder("PACKED", "SHIPPED"), true);
assert.equal(canTransitionOrder("SHIPPED", "DELIVERED"), true);
assert.equal(canTransitionOrder("PAID", "SHIPPED"), false);
assert.equal(canTransitionOrder("SHIPPED", "PACKED"), false);
assert.equal(canTransitionOrder("DELIVERED", "CANCELLED"), false);
assert.equal(canTransitionOrder("PAID", "CANCELLED"), true);
assert.equal(canTransitionOrder("unknown", "PACKED"), false);

console.log("PASS: order lifecycle transitions");

import assert from "node:assert/strict";
import { hmacSha256, verifyHmacSha256 } from "../src/lib/payment-signatures";

const secret = "test-signing-secret";
const checkoutMessage = "order_test_123|pay_test_456";
const checkoutSignature = hmacSha256(checkoutMessage, secret);
assert.equal(verifyHmacSha256(checkoutMessage, checkoutSignature, secret), true);
assert.equal(verifyHmacSha256("order_tampered|pay_test_456", checkoutSignature, secret), false);
assert.equal(verifyHmacSha256(checkoutMessage, "not-a-signature", secret), false);

const webhookPayload = JSON.stringify({ event: "payment.captured", payload: { id: "pay_test_456" } });
const webhookSignature = hmacSha256(webhookPayload, secret);
assert.equal(verifyHmacSha256(webhookPayload, webhookSignature, secret), true);
assert.equal(verifyHmacSha256(`${webhookPayload} `, webhookSignature, secret), false);

console.log("PASS: checkout and webhook HMAC signatures");

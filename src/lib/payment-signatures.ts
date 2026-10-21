import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256(message: string, secret: string) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function verifyHmacSha256(message: string, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(hmacSha256(message, secret), "hex");
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

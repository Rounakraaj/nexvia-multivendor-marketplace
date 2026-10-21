import { createHmac, timingSafeEqual } from "node:crypto";

export type ServicePrincipal = { sub: string; role: string };

function secret() { return process.env.SERVICE_API_SECRET; }

export function createServiceToken(principal: ServicePrincipal) {
  const key = secret();
  if (!key) return null;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ ...principal, iss: "nexvia-web", aud: "nexvia-api", exp: Math.floor(Date.now() / 1000) + 60 });
  const content = `${header}.${payload}`;
  return `${content}.${createHmac("sha256", key).update(content).digest("base64url")}`;
}

export function verifyServiceToken(token: string | undefined): ServicePrincipal | null {
  const key = secret();
  if (!key || !token) return null;
  const [header, payload, signature, extra] = token.split(".");
  if (!header || !payload || !signature || extra) return null;
  const content = `${header}.${payload}`;
  const expected = createHmac("sha256", key).update(content).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(signature, "base64url"); } catch { return null; }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (claims.iss !== "nexvia-web" || claims.aud !== "nexvia-api" || typeof claims.exp !== "number" || claims.exp < Date.now() / 1000 || typeof claims.sub !== "string" || typeof claims.role !== "string") return null;
    return { sub: claims.sub, role: claims.role };
  } catch { return null; }
}

export async function callApiService(path: string, principal: ServicePrincipal, init: RequestInit = {}) {
  const baseUrl = process.env.API_SERVICE_URL;
  const token = createServiceToken(principal);
  if (!baseUrl || !token) return null;
  try {
    return await fetch(new URL(path, baseUrl), {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(2500),
    });
  } catch { return null; }
}

import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

declare global {
  var nexviaRedisClient: RedisClient | undefined;
}

let unavailableUntil = 0;
const memoryCounters = new Map<string, { count: number; resetAt: number }>();

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL);
}

export function clientIp(value: string | null | undefined) {
  const ip = value?.split(",", 1)[0]?.trim();
  return ip && ip.length <= 64 && /^[a-fA-F0-9:.]+$/.test(ip) ? ip : "unknown";
}

export async function getRedisClient(): Promise<RedisClient | null> {
  const url = process.env.REDIS_URL;
  if (!url || Date.now() < unavailableUntil) return null;
  let client = globalThis.nexviaRedisClient;
  if (!client) {
    client = createClient({
      url,
      socket: { connectTimeout: 800, reconnectStrategy: () => false },
    }) as RedisClient;
    client.on("error", () => {
      unavailableUntil = Math.max(unavailableUntil, Date.now() + 5000);
    });
    globalThis.nexviaRedisClient = client;
  }
  try {
    if (!client.isOpen) await client.connect();
    return client.isReady ? client : null;
  } catch (error) {
    unavailableUntil = Date.now() + 5000;
    globalThis.nexviaRedisClient = undefined;
    console.warn("Redis is unavailable; using local fallbacks.", error);
    return null;
  }
}

export async function redisCommand<T>(operation: (client: RedisClient) => Promise<T>): Promise<T | undefined> {
  const client = await getRedisClient();
  if (!client) return undefined;
  try {
    return await operation(client);
  } catch (error) {
    unavailableUntil = Date.now() + 5000;
    globalThis.nexviaRedisClient = undefined;
    console.warn("Redis command failed; using local fallbacks.", error);
    return undefined;
  }
}

export async function invalidateCatalogCache(includeCategories = false) {
  await redisCommand(async (client) => {
    const transaction = client.multi().incr("cache:search-version");
    if (includeCategories) transaction.del("cache:categories");
    await transaction.exec();
  });
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export async function rateLimit(keys: string[], limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = Date.now();
  const client = await getRedisClient();
  if (client) {
    try {
      let retryAfterSeconds = 0;
      for (const key of keys) {
        const redisKey = `rate:${key}`;
        const count = await client.incr(redisKey);
        if (count === 1) await client.expire(redisKey, windowSeconds);
        if (count > limit) {
          const ttl = await client.ttl(redisKey);
          retryAfterSeconds = Math.max(retryAfterSeconds, ttl > 0 ? ttl : windowSeconds);
        }
      }
      return { allowed: retryAfterSeconds === 0, retryAfterSeconds };
    } catch (error) {
      unavailableUntil = Date.now() + 5000;
      globalThis.nexviaRedisClient = undefined;
      console.warn("Redis rate limiting is unavailable; using the per-process limit fallback.", error);
    }
  }

  let retryAfterSeconds = 0;
  for (const key of keys) {
    const current = memoryCounters.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowSeconds * 1000 } : current;
    bucket.count++;
    memoryCounters.set(key, bucket);
    if (bucket.count > limit) retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((bucket.resetAt - now) / 1000));
  }
  if (memoryCounters.size > 5000) {
    for (const [key, bucket] of memoryCounters) if (bucket.resetAt <= now) memoryCounters.delete(key);
  }
  return { allowed: retryAfterSeconds === 0, retryAfterSeconds };
}

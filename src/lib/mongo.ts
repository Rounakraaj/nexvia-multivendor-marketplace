import { MongoClient, type Collection, type Document } from "mongodb";

declare global {
  // Reuse one Mongo connection across Next.js hot reloads and requests.
  var mongoClientPromise: Promise<MongoClient> | undefined;
}

let mongoUnavailableUntil = 0;
const readyIndexes = new Set<string>();

export async function getMongoCollection<T extends Document>(name: string): Promise<Collection<T> | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (Date.now() < mongoUnavailableUntil) return null;

  try {
    globalThis.mongoClientPromise ??= new MongoClient(uri, { serverSelectionTimeoutMS: 500 }).connect();
    const client = await globalThis.mongoClientPromise;
    const collection = client.db(process.env.MONGODB_DATABASE || "nexvia").collection<T>(name);
    if (!readyIndexes.has(name)) {
      if (name === "zeroResultSearches") await collection.createIndex({ createdAt: -1 });
      if (name === "productReviews") {
        await collection.createIndex({ productId: 1, customerId: 1 }, { unique: true });
        await collection.createIndex({ productId: 1, createdAt: -1 });
      }
      if (name === "coupons") await collection.createIndex({ code: 1 }, { unique: true });
      if (name === "couponReservations") {
        await collection.createIndex({ reservationKey: 1 }, { unique: true });
        await collection.createIndex({ orderId: 1 }, { unique: true, sparse: true });
      }
      if (name === "activityLogs") {
        await collection.createIndex({ createdAt: -1 });
        await collection.createIndex({ actorId: 1, createdAt: -1 });
      }
      readyIndexes.add(name);
    }
    return collection;
  } catch (error) {
    globalThis.mongoClientPromise = undefined;
    mongoUnavailableUntil = Date.now() + 30_000;
    console.warn("MongoDB analytics is unavailable; the marketplace will continue without analytics.", error);
    return null;
  }
}

export type ZeroResultSearch = {
  query: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  createdAt: Date;
};

export async function recordZeroResultSearch(record: ZeroResultSearch) {
  try {
    const collection = await getMongoCollection<ZeroResultSearch & Document>("zeroResultSearches");
    if (collection) await collection.insertOne(record);
  } catch (error) {
    console.warn("Could not record a zero-result search; search results are unaffected.", error);
  }
}

export type ActivityLog = { actorId: string | null; actorRole: string | null; action: string; targetType: string; targetId: string | null; details?: Record<string, string | number | boolean | null>; createdAt: Date };

export async function recordActivity(event: ActivityLog) {
  try {
    const collection = await getMongoCollection<ActivityLog & Document>("activityLogs");
    if (collection) await collection.insertOne(event);
  } catch (error) {
    console.warn("Could not record an activity event.", error);
  }
}

export async function getZeroResultQueryStats(days = 30, limit = 10) {
  try {
    const collection = await getMongoCollection<ZeroResultSearch & Document>("zeroResultSearches");
    if (!collection) return [];
    return await collection.aggregate<{ query: string; count: number }>([
      { $match: { createdAt: { $gte: new Date(Date.now() - days * 86_400_000) } } },
      { $group: { _id: "$query", count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: limit },
      { $project: { _id: 0, query: "$_id", count: 1 } },
    ]).toArray();
  } catch (error) {
    console.warn("Could not read zero-result query analytics.", error);
    return [];
  }
}

export async function getRecentActivity(limit = 20) {
  try {
    const collection = await getMongoCollection<ActivityLog & Document>("activityLogs");
    if (!collection) return null;
    return await collection.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  } catch (error) {
    console.warn("Could not read activity analytics.", error);
    return null;
  }
}

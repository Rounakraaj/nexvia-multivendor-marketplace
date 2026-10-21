import { MongoClient, type Collection, type Document } from "mongodb";

declare global {
  // Reuse one Mongo connection across Next.js hot reloads and requests.
  var mongoClientPromise: Promise<MongoClient> | undefined;
}

let mongoUnavailableUntil = 0;

async function getCollection<T extends Document>(name: string): Promise<Collection<T> | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (Date.now() < mongoUnavailableUntil) return null;

  try {
    globalThis.mongoClientPromise ??= new MongoClient(uri, { serverSelectionTimeoutMS: 500 }).connect();
    const client = await globalThis.mongoClientPromise;
    return client.db(process.env.MONGODB_DATABASE || "nexvia").collection<T>(name);
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
    const collection = await getCollection<ZeroResultSearch>("zeroResultSearches");
    if (collection) await collection.insertOne(record);
  } catch (error) {
    console.warn("Could not record a zero-result search; search results are unaffected.", error);
  }
}

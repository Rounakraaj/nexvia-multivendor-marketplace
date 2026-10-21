import { Client, type estypes } from "@elastic/elasticsearch";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const indexName = process.env.ELASTICSEARCH_INDEX || "nexvia-products";
const PAGE_SIZE = 20;

export type ProductSearchFilters = {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: "relevance" | "price_asc" | "price_desc" | "newest" | "rating";
  page?: number;
};

type ProductDocument = {
  title: string;
  suggest: { input: string[] };
  category: string;
  price: number;
  stock: number;
  vendor: { id: string; shopName: string; approved: boolean };
  rating: number;
  createdAt: string;
};

let elastic: Client | null | undefined;
let indexReady: Promise<void> | undefined;

function searchClient() {
  if (elastic !== undefined) return elastic;
  const node = process.env.ELASTICSEARCH_URL;
  if (!node) return elastic = null;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;
  const username = process.env.ELASTICSEARCH_USERNAME;
  const password = process.env.ELASTICSEARCH_PASSWORD;
  elastic = new Client({
    node,
    ...(apiKey ? { auth: { apiKey } } : username && password ? { auth: { username, password } } : {}),
    requestTimeout: 1500,
    maxRetries: 0,
  });
  return elastic;
}

function mappings(): { mappings: estypes.MappingTypeMapping } {
  return {
    mappings: {
      properties: {
        title: { type: "text", fields: { keyword: { type: "keyword" } } },
        suggest: { type: "completion", max_input_length: 100 },
        category: { type: "keyword" },
        price: { type: "scaled_float", scaling_factor: 100 },
        stock: { type: "integer" },
        vendor: { properties: { id: { type: "keyword" }, shopName: { type: "text", fields: { keyword: { type: "keyword" } } }, approved: { type: "boolean" } } },
        rating: { type: "float" },
        createdAt: { type: "date" },
      },
    },
  };
}

async function ensureIndex(client: Client) {
  indexReady ??= (async () => {
    const exists = await client.indices.exists({ index: indexName });
    if (!exists) {
      try {
        await client.indices.create({ index: indexName, ...mappings() });
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("resource_already_exists_exception")) throw error;
      }
    }
  })();
  try {
    await indexReady;
  } catch (error) {
    indexReady = undefined;
    throw error;
  }
}

function toDocument(product: {
  title: string;
  category: string;
  price: Prisma.Decimal;
  stock: number;
  averageRating: number;
  createdAt: Date;
  vendor: { id: string; shopName: string; approved: boolean };
}): ProductDocument {
  return {
    title: product.title,
    suggest: { input: [product.title] },
    category: product.category,
    price: Number(product.price),
    stock: product.stock,
    vendor: product.vendor,
    rating: product.averageRating,
    createdAt: product.createdAt.toISOString(),
  };
}

export async function syncProductSearchDocument(productId: string) {
  const client = searchClient();
  if (!client) return false;
  try {
    await ensureIndex(client);
    const product = await db.product.findUnique({ where: { id: productId }, include: { vendor: true } });
    if (!product || !product.vendor.approved) {
      await client.delete({ index: indexName, id: productId, refresh: "wait_for" }).catch(() => undefined);
      return true;
    }
    await client.index({ index: indexName, id: product.id, document: toDocument(product), refresh: "wait_for" });
    return true;
  } catch (error) {
    indexReady = undefined;
    console.warn("Elasticsearch product sync failed; PostgreSQL remains the source of truth.", error);
    return false;
  }
}

export async function syncVendorSearchDocuments(vendorId: string, approved: boolean) {
  const client = searchClient();
  if (!client) return false;
  try {
    await ensureIndex(client);
    if (!approved) {
      await client.deleteByQuery({ index: indexName, query: { term: { "vendor.id": vendorId } }, refresh: true, conflicts: "proceed" });
      return true;
    }
    const products = await db.product.findMany({ where: { vendorId }, include: { vendor: true } });
    if (products.length) {
      await client.bulk({
        refresh: "wait_for",
        operations: products.flatMap((product) => [{ index: { _index: indexName, _id: product.id } }, toDocument(product)]),
      });
    }
    return true;
  } catch (error) {
    indexReady = undefined;
    console.warn("Elasticsearch vendor sync failed; PostgreSQL remains the source of truth.", error);
    return false;
  }
}

function prismaWhere(filters: ProductSearchFilters): Prisma.ProductWhereInput {
  return {
    vendor: { approved: true },
    ...(filters.q ? { title: { contains: filters.q, mode: "insensitive" } } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.inStock ? { stock: { gt: 0 } } : {}),
    ...(filters.minPrice !== undefined || filters.maxPrice !== undefined ? { price: {
      ...(filters.minPrice !== undefined ? { gte: filters.minPrice } : {}),
      ...(filters.maxPrice !== undefined ? { lte: filters.maxPrice } : {}),
    } } : {}),
  };
}

function prismaOrderBy(sort: ProductSearchFilters["sort"]): Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] {
  if (sort === "price_asc") return { price: "asc" };
  if (sort === "price_desc") return { price: "desc" };
  if (sort === "rating") return [{ averageRating: "desc" }, { createdAt: "desc" }];
  if (sort === "relevance") return { createdAt: "desc" };
  return { createdAt: "desc" };
}

async function searchPostgres(filters: ProductSearchFilters) {
  const page = filters.page ?? 1;
  const where = prismaWhere(filters);
  const [products, total] = await Promise.all([
    db.product.findMany({ where, orderBy: prismaOrderBy(filters.sort), skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { vendor: { select: { shopName: true } } } }),
    db.product.count({ where }),
  ]);
  return { products, total, page, pageSize: PAGE_SIZE, source: "postgres" as const };
}

function elasticSort(sort: ProductSearchFilters["sort"]): estypes.Sort {
  if (sort === "price_asc") return [{ price: { order: "asc" } }, { _score: { order: "desc" } }];
  if (sort === "price_desc") return [{ price: { order: "desc" } }, { _score: { order: "desc" } }];
  if (sort === "newest") return [{ createdAt: { order: "desc" } }];
  if (sort === "rating") return [{ rating: { order: "desc" } }, { createdAt: { order: "desc" } }];
  return [{ _score: { order: "desc" } }, { createdAt: { order: "desc" } }];
}

export async function searchProducts(filters: ProductSearchFilters) {
  const client = searchClient();
  if (!client) return searchPostgres(filters);
  try {
    await ensureIndex(client);
    const filter: estypes.QueryDslQueryContainer[] = [{ term: { "vendor.approved": true } }];
    if (filters.category) filter.push({ term: { category: filters.category } });
    if (filters.inStock) filter.push({ range: { stock: { gt: 0 } } });
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) filter.push({ range: { price: {
      ...(filters.minPrice !== undefined ? { gte: filters.minPrice } : {}),
      ...(filters.maxPrice !== undefined ? { lte: filters.maxPrice } : {}),
    } } });
    const page = filters.page ?? 1;
    const response = await client.search<ProductDocument>({
      index: indexName,
      from: (page - 1) * PAGE_SIZE,
      size: PAGE_SIZE,
      sort: elasticSort(filters.sort),
      query: { bool: {
        must: filters.q ? [{ multi_match: { query: filters.q, fields: ["title^3", "vendor.shopName"], fuzziness: "AUTO", operator: "and" } }] : [{ match_all: {} }],
        filter,
      } },
    });
    const ids = response.hits.hits.flatMap((hit) => hit._id ? [hit._id] : []);
    const products = ids.length ? await db.product.findMany({ where: { id: { in: ids }, vendor: { approved: true } }, include: { vendor: { select: { shopName: true } } } }) : [];
    const byId = new Map(products.map((product) => [product.id, product]));
    const total = typeof response.hits.total === "number" ? response.hits.total : response.hits.total?.value ?? 0;
    return { products: ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []), total, page, pageSize: PAGE_SIZE, source: "elasticsearch" as const };
  } catch (error) {
    indexReady = undefined;
    console.warn("Elasticsearch search failed; using PostgreSQL search.", error);
    return searchPostgres(filters);
  }
}

export async function suggestProducts(query: string) {
  const client = searchClient();
  if (client) {
    try {
      await ensureIndex(client);
      const response = await client.search<ProductDocument>({
        index: indexName,
        size: 0,
        query: { term: { "vendor.approved": true } },
        suggest: { titles: { prefix: query, completion: { field: "suggest", size: 8, skip_duplicates: true } } },
      });
      const groups = response.suggest?.titles as Array<{ options: Array<{ text: string }> }> | undefined;
      const suggestions = groups?.flatMap((group) => group.options.map((option) => option.text)) ?? [];
      if (suggestions.length) return suggestions;
    } catch (error) {
      indexReady = undefined;
      console.warn("Elasticsearch suggestions failed; using PostgreSQL suggestions.", error);
    }
  }
  const products = await db.product.findMany({ where: { vendor: { approved: true }, title: { startsWith: query, mode: "insensitive" } }, select: { title: true }, distinct: ["title"], take: 8, orderBy: { title: "asc" } });
  return products.map((product) => product.title);
}

export async function reindexAllProducts() {
  const client = searchClient();
  if (!client) return false;
  await indexReady;
  indexReady = undefined;
  try {
    if (await client.indices.exists({ index: indexName })) await client.indices.delete({ index: indexName });
    await client.indices.create({ index: indexName, ...mappings() });
    let cursor: string | undefined;
    let count = 0;
    while (true) {
      const products = await db.product.findMany({
        where: { vendor: { approved: true } },
        include: { vendor: true },
        orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: 500,
      });
      if (!products.length) break;
      const result = await client.bulk({
        refresh: false,
        operations: products.flatMap((product) => [{ index: { _index: indexName, _id: product.id } }, toDocument(product)]),
      });
      if (result.errors) throw new Error("Elasticsearch reported one or more product indexing failures.");
      count += products.length;
      cursor = products[products.length - 1].id;
    }
    await client.indices.refresh({ index: indexName });
    return count;
  } catch (error) {
    indexReady = undefined;
    throw error;
  }
}

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { db } from "../src/lib/db";
import { paiseToDecimal, toPaise } from "../src/lib/money";
import { reindexAllProducts } from "../src/lib/search";

type Row = Record<string, string>;
type SalesAggregate = { priceTotal: number; rows: number; soldQuantity: number; sellerId: string | null };
function flag(name: string) { const index = process.argv.indexOf("--" + name); return index >= 0 ? process.argv[index + 1] : undefined; }
function normalizeKey(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]/g, ""); }
function get(row: Row, names: string[]) {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
  for (const name of names) { const value = normalized.get(normalizeKey(name)); if (value?.trim()) return value.trim(); }
  return "";
}
function numberValue(raw: string) {
  let value = raw.replace(/[^0-9,.-]/g, "");
  if (value.includes(",") && !value.includes(".")) value = value.replace(",", "."); else value = value.replace(/,/g, "");
  const result = Number(value); return Number.isFinite(result) ? result : 0;
}
async function loadCsv(path: string): Promise<Row[]> {
  return parse(await readFile(path, "utf8"), { columns: true, skip_empty_lines: true, bom: true, trim: true, relax_column_count: true }) as Row[];
}
async function main() {
  const productsPath = flag("products");
  const itemsPath = flag("order-items");
  const source = (flag("source") ?? "csv").trim().toLowerCase();
  const emailList = (flag("vendors") ?? "aarav@techhub.demo,diya@urbanthread.demo,kabir@homenest.demo").split(",").map((email) => email.trim()).filter(Boolean);
  if (!productsPath) throw new Error("Usage: npm run import:csv -- --products <products.csv> [--order-items <order-items.csv>] [--source olist|flipkart] [--vendors email1,email2]");
  if (!/^[a-z0-9_-]{2,24}$/.test(source)) throw new Error("Source must contain 2-24 letters, numbers, dashes, or underscores.");
  const vendors = await db.vendor.findMany({ where: { user: { email: { in: emailList } }, approved: true } });
  if (vendors.length === 0) throw new Error("No approved vendors match --vendors. Run npm run seed first or pass approved vendor emails.");
  const productRows = await loadCsv(productsPath);
  if (productRows.length === 0) throw new Error("The products CSV is empty.");
  const salesByProduct = new Map<string, SalesAggregate>();
  if (itemsPath) for (const row of await loadCsv(itemsPath)) {
    const productId = get(row, ["product_id", "product id", "productid", "sku"]);
    if (!productId) continue;
    const quantity = Math.max(1, Math.round(numberValue(get(row, ["quantity", "qty"])))) || 1;
    const price = numberValue(get(row, ["price", "selling_price", "retail_price", "discounted_price"]));
    const sellerId = get(row, ["seller_id", "seller id", "vendor_id"]);
    const current = salesByProduct.get(productId) ?? { priceTotal: 0, rows: 0, soldQuantity: 0, sellerId: null };
    current.priceTotal += price; current.rows += 1; current.soldQuantity += quantity; current.sellerId ??= sellerId || null;
    salesByProduct.set(productId, current);
  }
  const rate = Number(process.env.CSV_SOURCE_TO_INR_RATE) || 1;
  const defaultStock = Math.max(1, Math.min(1000, Number(process.env.CSV_IMPORT_DEFAULT_STOCK) || 10));
  const sellerAssignments = new Map<string, number>();
  const records = [];
  for (const [index, row] of productRows.entries()) {
    const sourceId = get(row, ["product_id", "product id", "productid", "sku", "id"]);
    if (!sourceId) continue;
    const sales = salesByProduct.get(sourceId);
    const rawPrice = numberValue(get(row, ["price", "selling_price", "retail_price", "discounted_price"])) || (sales?.rows ? sales.priceTotal / sales.rows : 0);
    if (rawPrice <= 0) continue;
    const sellerId = get(row, ["seller_id", "seller id", "vendor_id"]) || sales?.sellerId || "";
    let vendorIndex = index % vendors.length;
    if (sellerId) { if (!sellerAssignments.has(sellerId)) sellerAssignments.set(sellerId, sellerAssignments.size % vendors.length); vendorIndex = sellerAssignments.get(sellerId)!; }
    const categoryRaw = get(row, ["category", "product_category_name", "category_name"]) || "Imported";
    const category = categoryRaw.replace(/_/g, " ").replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    const title = get(row, ["title", "product_name", "product title", "name"]) || category + " " + sourceId;
    const description = get(row, ["description", "product_description"]) || "Imported " + source.toUpperCase() + " catalog item " + sourceId + ".";
    const explicitStock = numberValue(get(row, ["stock", "quantity", "inventory", "available_stock"]));
    const stock = explicitStock > 0 ? Math.round(explicitStock) : Math.max(5, Math.min(100, sales?.soldQuantity || defaultStock));
    records.push({ sourceKey: source + ":" + sourceId, vendorId: vendors[vendorIndex].id, title: title.slice(0, 200), category: category.slice(0, 80), description: description.slice(0, 2000), price: paiseToDecimal(toPaise((rawPrice * rate).toFixed(2))), stock });
  }
  if (records.length === 0) throw new Error("No rows had a usable product ID and price. For Olist, pass the order-items CSV to supply prices.");
  let inserted = 0;
  for (let offset = 0; offset < records.length; offset += 500) inserted += (await db.product.createMany({ data: records.slice(offset, offset + 500), skipDuplicates: true })).count;
  let indexed = 0;
  try { indexed = await reindexAllProducts() || 0; } catch (error) { console.warn("Elasticsearch reindex skipped:", error instanceof Error ? error.message : error); }
  console.log("PASS: parsed " + productRows.length + " rows, " + inserted + " new products, " + (records.length - inserted) + " already imported; indexed " + indexed + " approved products.");
  console.log("The source CSVs were read from the supplied paths and were not copied into the repository.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); });

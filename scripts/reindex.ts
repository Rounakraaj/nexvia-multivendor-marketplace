import "dotenv/config";
import { reindexAllProducts } from "../src/lib/search";

async function main() {
  try {
    const result = await reindexAllProducts();
    if (result === false) {
      console.log("SKIP: Elasticsearch is not configured. PostgreSQL search remains active.");
      return;
    }
    console.log(`PASS: indexed ${result} approved products in Elasticsearch`);
  } catch (error) {
    console.error("FAIL: Elasticsearch reindex failed", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

void main();

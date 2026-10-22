import Link from "next/link";
import { z } from "zod";
import { getProductCategories } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { searchProducts, type ProductSearchFilters } from "@/lib/search";
import { recordZeroResultSearch } from "@/lib/mongo";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

type SP = { q?: string; category?: string; sort?: string; minPrice?: string; maxPrice?: string; inStock?: string; page?: string };
const priceSchema = z.coerce.number().finite().min(0).max(10_000_000);
const pageSchema = z.coerce.number().int().min(1).max(100_000);
const sortValues = ["relevance", "price_asc", "price_desc", "newest", "rating"] as const;
type SortValue = typeof sortValues[number];

function numberParam(value: string | undefined, schema: typeof priceSchema | typeof pageSchema) {
  if (!value) return undefined;
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

function href(params: SP) {
  const sp = new URLSearchParams();
  for (const key of ["q", "category", "sort", "minPrice", "maxPrice", "inStock", "page"] as const) {
    const value = params[key];
    if (value) sp.set(key, value);
  }
  const value = sp.toString();
  return value ? `/?${value}` : "/";
}

const sorts: [SortValue, string][] = [["relevance", "Relevance"], ["price_asc", "Price: low to high"], ["price_desc", "Price: high to low"], ["newest", "Newest"], ["rating", "Top rated"]];

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const category = sp.category?.trim().slice(0, 80) || undefined;
  const minPrice = numberParam(sp.minPrice, priceSchema);
  const maxPrice = numberParam(sp.maxPrice, priceSchema);
  const inStock = sp.inStock === "1";
  const page = numberParam(sp.page, pageSchema) ?? 1;
  const sort = sortValues.includes(sp.sort as SortValue) ? sp.sort as SortValue : q ? "relevance" : "newest";
  const searching = Boolean(q || category || minPrice !== undefined || maxPrice !== undefined || inStock);
  const filters: ProductSearchFilters = { q, category, minPrice, maxPrice, inStock, sort, page };
  const categories = await getProductCategories();
  const results = searching ? await searchProducts(filters) : null;
  const products = results?.products ?? [];
  const total = results?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (results?.pageSize ?? 20)));
  if (searching && total === 0) {
    await recordZeroResultSearch({ query: q ?? "", category, minPrice, maxPrice, ...(inStock ? { inStock } : {}), createdAt: new Date() });
  }

  const baseParams: SP = { q, category, minPrice: sp.minPrice, maxPrice: sp.maxPrice, ...(inStock ? { inStock: "1" } : {}) };
  const chip = (active: boolean) => `inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium ${active ? "border-[var(--lime)] bg-[var(--lime)] text-black" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--text)] hover:text-[var(--text)]"}`;
  return <>
    <SiteHeader />
    <section className="border-b border-[var(--line)]">
      <div className="mx-auto max-w-4xl px-5 py-16 text-center sm:py-24">
        <p className="mb-4 text-sm text-[var(--muted)]">Independent sellers. Clear prices.</p>
        <h1 className="text-4xl font-extrabold leading-tight tracking-[-0.03em] sm:text-6xl">Find what you need<span className="text-[#FF2E93]">.</span></h1>
        <p className="mx-auto mt-3 max-w-md text-[var(--muted)]">Search products from independent sellers.</p>
        <form action="/" className="relative mx-auto mt-8 flex w-full max-w-2xl">
          {category && <input type="hidden" name="category" value={category} />}
          <input name="q" type="search" defaultValue={q} placeholder="Search products" aria-label="Search products" className="field pr-12" />
          <kbd className="pointer-events-none absolute right-[105px] top-1/2 -translate-y-1/2 rounded border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)]">/</kbd>
          <button className="btn btn-primary ml-2">Search</button>
        </form>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href={href({ ...baseParams, q, category: undefined })} className={chip(!category)}>All categories</Link>
          {categories.map((item) => <Link key={item} href={href({ ...baseParams, q, category: item })} className={chip(category === item)}>{item}</Link>)}
        </div>
        {!searching && <p className="mt-8 text-sm text-[var(--muted)]">Results appear after a search or category pick.</p>}
      </div>
    </section>
    {searching && <main className="mx-auto min-h-[40vh] max-w-4xl px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-[var(--muted)]"><span className="font-semibold text-[var(--text)]">{total} {total === 1 ? "result" : "results"}</span>{q ? ` for â€œ${q}â€` : ""}{category ? ` in ${category}` : ""}</p>
        {total > 1 && <nav aria-label="Sort products" className="flex flex-wrap rounded-[10px] border border-[var(--line)] p-1">{sorts.map(([value, label]) => <Link key={value} href={href({ ...baseParams, sort: value })} aria-current={sort === value ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-xs sm:text-sm ${sort === value ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>{label}</Link>)}</nav>}
      </div>
      {results?.source === "postgres" && process.env.ELASTICSEARCH_URL && <p className="mt-3 text-xs text-[var(--muted)]">Enhanced search is temporarily unavailable. Showing standard search results.</p>}
      {results?.cacheAvailable === false && <p className="mt-2 text-xs text-[var(--muted)]">Redis is temporarily unavailable. Search is continuing without cached results.</p>}
      <form action="/" className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--line)] p-4">
        {q && <input type="hidden" name="q" value={q} />}{category && <input type="hidden" name="category" value={category} />}
        <label className="text-left text-xs text-[var(--muted)]">Minimum price<input name="minPrice" type="number" min="0" step="0.01" defaultValue={sp.minPrice} className="field mt-1 w-36" /></label>
        <label className="text-left text-xs text-[var(--muted)]">Maximum price<input name="maxPrice" type="number" min="0" step="0.01" defaultValue={sp.maxPrice} className="field mt-1 w-36" /></label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="inStock" value="1" defaultChecked={inStock} />In stock</label>
        <button className="btn btn-secondary">Apply filters</button>
      </form>
      {products.length === 0 ? <div className="mt-6 py-12"><p className="text-lg font-semibold">No products found.</p><p className="mt-1 text-sm text-[var(--muted)]">Try a different search or choose another category.</p><Link href="/" className="btn btn-secondary mt-5">Clear search</Link></div> : <ul className="panel mt-6 divide-y divide-[var(--line)]">{products.map((product) => <li key={product.id}><Link href={`/products/${product.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--surface-2)]"><div className="min-w-0"><p className="truncate font-semibold">{product.title}</p><p className="truncate text-sm text-[var(--muted)]">{product.category} from {product.vendor.shopName}</p></div><div className="flex shrink-0 items-center gap-3">{product.stock === 0 && <span className="badge badge-bad">Out of stock</span>}<span className="nums whitespace-nowrap font-semibold">{formatPrice(Number(product.price))}</span></div></Link></li>)}</ul>}
      {totalPages > 1 && <nav aria-label="Search result pages" className="mt-6 flex items-center justify-center gap-4"><Link aria-disabled={page <= 1} className={`btn btn-secondary btn-sm ${page <= 1 ? "pointer-events-none opacity-50" : ""}`} href={href({ ...baseParams, sort, page: String(page - 1) })}>Previous</Link><span className="text-sm text-[var(--muted)]">Page {page} of {totalPages}</span><Link aria-disabled={page >= totalPages} className={`btn btn-secondary btn-sm ${page >= totalPages ? "pointer-events-none opacity-50" : ""}`} href={href({ ...baseParams, sort, page: String(page + 1) })}>Next</Link></nav>}
    </main>}
    <SiteFooter />
  </>;
}


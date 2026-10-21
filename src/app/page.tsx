import Link from "next/link";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

type SP = { q?: string; category?: string; sort?: string };
function href(params: SP) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.category) sp.set("category", params.category);
  if (params.sort) sp.set("sort", params.sort);
  const value = sp.toString();
  return value ? `/?${value}` : "/";
}
const sorts: [string, string][] = [["", "Newest"], ["price_asc", "Price: low to high"], ["price_desc", "Price: high to low"]];

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const category = sp.category || undefined;
  const sort = sp.sort || undefined;
  const searching = Boolean(q || category);
  const orderBy = sort === "price_asc" ? { price: "asc" as const } : sort === "price_desc" ? { price: "desc" as const } : { createdAt: "desc" as const };
  const categories = await db.product.findMany({ where: { vendor: { approved: true } }, select: { category: true }, distinct: ["category"], orderBy: { category: "asc" } });
  const products = searching ? await db.product.findMany({
    where: { vendor: { approved: true }, ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}), ...(category ? { category } : {}) },
    orderBy,
    include: { vendor: { select: { shopName: true } } },
  }) : [];
  const chip = (active: boolean) => `inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium ${active ? "border-[var(--lime)] bg-[var(--lime)] text-black" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--text)] hover:text-[var(--text)]"}`;
  return <>
    <SiteHeader />
    <section className="border-b border-[var(--line)]">
      <div className="mx-auto max-w-4xl px-5 py-16 text-center sm:py-24">
        <p className="mb-4 text-sm text-[var(--muted)]">Independent sellers. Clear prices.</p>
        <h1 className="text-4xl font-extrabold leading-tight tracking-[-0.03em] sm:text-6xl">Find what you need.</h1>
        <p className="mx-auto mt-3 max-w-md text-[var(--muted)]">Search products from independent sellers.</p>
        <form action="/" className="relative mx-auto mt-8 flex w-full max-w-2xl">
          {category && <input type="hidden" name="category" value={category} />}
          <input name="q" type="search" defaultValue={q} placeholder="Search products" aria-label="Search products" className="field pr-12" />
          <kbd className="pointer-events-none absolute right-[105px] top-1/2 -translate-y-1/2 rounded border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)]">/</kbd>
          <button className="btn btn-primary ml-2">Search</button>
        </form>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href={href({ q })} className={chip(!category)}>All categories</Link>
          {categories.map((c) => <Link key={c.category} href={href({ q, category: c.category })} className={chip(category === c.category)}>{c.category}</Link>)}
        </div>
        {!searching && <p className="mt-8 text-sm text-[var(--muted)]">Results appear after a search or category pick.</p>}
      </div>
    </section>
    {searching && <main className="mx-auto min-h-[40vh] max-w-4xl px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-[var(--muted)]"><span className="font-semibold text-[var(--text)]">{products.length} {products.length === 1 ? "result" : "results"}</span>{q ? ` for “${q}”` : ""}{category ? ` in ${category}` : ""}</p>
        {products.length > 1 && <nav aria-label="Sort products" className="flex flex-wrap rounded-[10px] border border-[var(--line)] p-1">{sorts.map(([value, label]) => <Link key={label} href={href({ q, category, sort: value || undefined })} className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-xs sm:text-sm ${(sort ?? "") === value ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>{label}</Link>)}</nav>}
      </div>
      {products.length === 0 ? <div className="mt-6 py-12"><p className="text-lg font-semibold">No products found.</p><p className="mt-1 text-sm text-[var(--muted)]">Try a different search or choose another category.</p><Link href="/" className="btn btn-secondary mt-5">Clear search</Link></div> : <ul className="panel mt-6 divide-y divide-[var(--line)]">{products.map((p) => <li key={p.id}><Link href={`/products/${p.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--surface-2)]"><div className="min-w-0"><p className="truncate font-semibold">{p.title}</p><p className="truncate text-sm text-[var(--muted)]">{p.category} from {p.vendor.shopName}</p></div><div className="flex shrink-0 items-center gap-3">{p.stock === 0 && <span className="badge badge-bad">Out of stock</span>}<span className="nums whitespace-nowrap font-semibold">{formatPrice(Number(p.price))}</span></div></Link></li>)}</ul>}
    </main>}
    <SiteFooter />
  </>;
}

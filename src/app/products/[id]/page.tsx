import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AddToCartButton from "@/components/AddToCartButton";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.product.findFirst({
    where: { id, vendor: { approved: true } },
    include: { vendor: { select: { shopName: true } } },
  });
  if (!p) notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <nav className="text-sm text-[var(--muted)]" aria-label="Breadcrumb">
          <Link href="/" className="tap-target inline-flex items-center px-1 hover:underline">Shop</Link>
          <span className="mx-2">/</span>
          <Link href={`/?category=${encodeURIComponent(p.category)}`} className="tap-target inline-flex items-center px-1 hover:underline">{p.category}</Link>
        </nav>

        {p.image?.startsWith("products/") && <div className="relative mt-6 aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]">
          <Image src={`/api/product-images?key=${encodeURIComponent(p.image)}`} alt={p.title} fill unoptimized priority className="object-cover" sizes="(max-width: 672px) 100vw, 672px" />
        </div>}
        <p className="mt-8 text-sm text-[var(--muted)]">Sold by {p.vendor.shopName}</p>
        <h1 className="mt-1 text-4xl font-extrabold leading-tight">{p.title}</h1>
        <p className="nums mt-5 text-3xl font-extrabold">{formatPrice(Number(p.price))}</p>
        <p className="mt-3">
          <span className={`badge ${p.stock > 0 ? "badge-ok" : "badge-bad"}`}>
            {p.stock > 0 ? `In stock (${p.stock} available)` : "Out of stock"}
          </span>
        </p>
        {p.description && <p className="mt-6 leading-relaxed text-[var(--muted)]">{p.description}</p>}

        <AddToCartButton
          id={p.id}
          title={p.title}
          price={Number(p.price)}
          image={p.image?.startsWith("products/") ? `/api/product-images?key=${encodeURIComponent(p.image)}` : null}
          shop={p.vendor.shopName}
          stock={p.stock}
        />
        <p className="mt-3 text-sm text-[var(--muted)]">Prices and stock are confirmed at checkout.</p>
      </main>
      <SiteFooter />
    </>
  );
}

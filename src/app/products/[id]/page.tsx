import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AddToCartButton from "@/components/AddToCartButton";
import ReviewForm from "@/components/ReviewForm";
import VendorReviewReplyForm from "@/components/VendorReviewReplyForm";
import { listProductReviews } from "@/lib/marketplace-data";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.product.findFirst({
    where: { id, vendor: { approved: true } },
    include: { vendor: { select: { id: true, shopName: true } } },
  });
  if (!p) notFound();
  const session = await getServerSession(authOptions);
  const [reviews, eligibleOrder, viewerVendor] = await Promise.all([
    listProductReviews(p.id),
    session?.user.role === "CUSTOMER" ? db.order.findFirst({ where: { customerId: session.user.id, status: "DELIVERED", items: { some: { productId: p.id } } }, select: { id: true } }) : Promise.resolve(null),
    session?.user.role === "VENDOR" ? db.vendor.findUnique({ where: { userId: session.user.id }, select: { id: true } }) : Promise.resolve(null),
  ]);

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
        <p className="mt-2 text-sm" aria-label={`${p.averageRating.toFixed(1)} out of 5 from ${p.ratingCount} reviews`}><span className="text-amber-500">{p.ratingCount ? "★".repeat(Math.round(p.averageRating)) : "☆☆☆☆☆"}</span><span className="ml-2 text-[var(--muted)]">{p.averageRating.toFixed(1)} · {p.ratingCount} {p.ratingCount === 1 ? "review" : "reviews"}</span></p>
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
        <section className="mt-10 border-t border-[var(--line)] pt-6">
          <h2 className="text-2xl font-bold">Customer reviews</h2>
          {reviews === null ? <p className="panel mt-4 p-4 text-sm text-[var(--muted)]">Reviews are temporarily unavailable because MongoDB could not be reached.</p> : reviews.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No reviews yet.</p> : <ul className="mt-4 space-y-3">{reviews.map((review) => <li key={review.id} className="panel p-4"><p className="font-semibold">{review.customerName} <span className="ml-2 text-amber-500">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></p><p className="mt-2 whitespace-pre-wrap text-sm">{review.comment}</p><p className="mt-2 text-xs text-[var(--muted)]">{review.createdAt.toLocaleDateString("en-IN")}</p>{review.vendorReply && <div className="mt-3 rounded-lg bg-[var(--surface-2)] p-3"><p className="text-xs font-semibold">Shop reply</p><p className="mt-1 whitespace-pre-wrap text-sm">{review.vendorReply}</p></div>}{viewerVendor?.id === p.vendor.id && !review.vendorReply && <VendorReviewReplyForm reviewId={review.id} productId={p.id} />}</li>)}</ul>}
          {eligibleOrder && <ReviewForm productId={p.id} />}
          {session?.user.role === "CUSTOMER" && !eligibleOrder && <p className="mt-3 text-xs text-[var(--muted)]">Reviews are available after a delivered order containing this product.</p>}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

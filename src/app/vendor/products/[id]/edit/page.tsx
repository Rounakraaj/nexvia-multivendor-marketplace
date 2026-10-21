import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedVendor } from "@/lib/guard";
import { db } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import ProductForm from "@/components/ProductForm";
import { updateProduct } from "../../../actions";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await requireApprovedVendor();
  const product = await db.product.findFirst({ where: { id, vendorId: vendor.id } });
  if (!product) notFound();

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-[var(--muted)]">
        <ol className="flex min-h-11 items-center gap-2"><li><Link href="/vendor" className="hover:text-[var(--text)]">Shop</Link></li><li aria-hidden="true">/</li><li><Link href="/vendor/products" className="hover:text-[var(--text)]">Products</Link></li><li aria-hidden="true">/</li><li aria-current="page" className="text-[var(--text)]">Edit product</li></ol>
      </nav>
      <PageHeader title="Edit product" description={product.title} />
      <div className="panel max-w-xl p-6">
        <ProductForm
          action={updateProduct.bind(null, product.id)}
          submitLabel="Save changes"
          product={{
            title: product.title,
            description: product.description,
            price: Number(product.price),
            stock: product.stock,
            category: product.category,
            image: product.image,
          }}
        />
      </div>
    </>
  );
}

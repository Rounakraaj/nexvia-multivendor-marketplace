import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedVendor } from "@/lib/guard";
import { db } from "@/lib/db";
import ProductForm from "@/components/ProductForm";
import { updateProduct } from "../../../actions";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await requireApprovedVendor();
  const product = await db.product.findFirst({ where: { id, vendorId: vendor.id } });
  if (!product) notFound();

  return (
    <main className="mx-auto max-w-xl p-8">
      <Link href="/vendor/products" className="text-sm text-indigo-600 hover:underline">Back to products</Link>
      <h1 className="mt-1 mb-6 text-3xl font-bold text-slate-900">Edit product</h1>
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
    </main>
  );
}

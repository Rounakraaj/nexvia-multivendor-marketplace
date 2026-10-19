import Link from "next/link";
import { requireApprovedVendor } from "@/lib/guard";
import ProductForm from "@/components/ProductForm";
import { createProduct } from "../../actions";

export default async function NewProductPage() {
  await requireApprovedVendor();
  return (
    <main className="mx-auto max-w-xl p-8">
      <Link href="/vendor/products" className="text-sm text-indigo-600 hover:underline">Back to products</Link>
      <h1 className="mt-1 mb-6 text-3xl font-bold text-slate-900">Add product</h1>
      <ProductForm action={createProduct} submitLabel="Create product" />
    </main>
  );
}

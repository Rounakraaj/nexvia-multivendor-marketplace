import Link from "next/link";
import { requireApprovedVendor } from "@/lib/guard";
import PageHeader from "@/components/PageHeader";
import ProductForm from "@/components/ProductForm";
import { createProduct } from "../../actions";

export default async function NewProductPage() {
  await requireApprovedVendor();
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-[var(--muted)]">
        <ol className="flex min-h-11 items-center gap-2"><li><Link href="/vendor" className="hover:text-[var(--text)]">Shop</Link></li><li aria-hidden="true">/</li><li><Link href="/vendor/products" className="hover:text-[var(--text)]">Products</Link></li><li aria-hidden="true">/</li><li aria-current="page" className="text-[var(--text)]">New product</li></ol>
      </nav>
      <PageHeader title="Add product" description="Fill in the details buyers will see." />
      <div className="panel max-w-xl p-6">
        <ProductForm action={createProduct} submitLabel="Create product" />
      </div>
    </>
  );
}

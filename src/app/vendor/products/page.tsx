import Link from "next/link";
import { requireApprovedVendor } from "@/lib/guard";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { deleteProduct } from "../actions";

export default async function ProductsPage() {
  const vendor = await requireApprovedVendor();
  const products = await db.product.findMany({
    where: { vendorId: vendor.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Products"
        description={`${products.length} listed in your shop.`}
        action={
          <Link href="/vendor/products/new" className="btn btn-primary">
            Add product
          </Link>
        }
      />

      <div className="panel overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-[var(--muted)]">
                  You have no products yet. Add your first product to start selling.
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id}>
                <td className="font-semibold">{p.title}</td>
                <td>{p.category}</td>
                <td>{formatPrice(Number(p.price))}</td>
                <td>
                  {p.stock <= 5 ? <span className="badge badge-warn">{p.stock} left</span> : p.stock}
                </td>
                <td>
                  <div className="flex justify-end gap-2">
                    <Link href={`/vendor/products/${p.id}/edit`} className="btn btn-secondary btn-sm">
                      Edit
                    </Link>
                    <form action={deleteProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn btn-danger btn-sm">Delete</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

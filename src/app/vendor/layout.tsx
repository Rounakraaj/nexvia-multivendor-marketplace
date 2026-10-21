import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import DashboardShell from "@/components/DashboardShell";

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["VENDOR"]);
  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id } });
  return (
    <DashboardShell
      roleLabel={vendor?.shopName ?? "Vendor"}
      name={session.user.name ?? "Vendor"}
      nav={[
        { href: "/vendor", label: "Overview", exact: true },
        { href: "/vendor/products", label: "Products" },
        { href: "/vendor/orders", label: "Orders" },
        { href: "/vendor/earnings", label: "Earnings" },
      ]}
    >
      {children}
    </DashboardShell>
  );
}

import { requireRole } from "@/lib/guard";
import DashboardShell from "@/components/DashboardShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["ADMIN"]);
  return (
    <DashboardShell
      roleLabel="Administrator"
      name={session.user.name ?? "Admin"}
      nav={[
        { href: "/admin", label: "Overview", exact: true },
        { href: "/admin/orders", label: "Orders" },
        { href: "/admin/commission", label: "Commission" },
      ]}
    >
      {children}
    </DashboardShell>
  );
}

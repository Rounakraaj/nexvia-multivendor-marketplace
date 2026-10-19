import { requireRole } from "@/lib/guard";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["ADMIN"]);
  return <>{children}</>;
}

import { requireRole } from "@/lib/guard";

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["VENDOR"]);
  return <>{children}</>;
}

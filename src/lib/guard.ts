import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

type Role = "CUSTOMER" | "VENDOR" | "ADMIN";

export async function requireRole(roles: Role[]): Promise<Session> {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!roles.includes(session.user.role)) redirect("/dashboard");
  return session;
}

export async function requireApprovedVendor() {
  const session = await requireRole(["VENDOR"]);
  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id } });
  if (!vendor || !vendor.approved) redirect("/vendor");
  return vendor;
}

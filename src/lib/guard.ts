import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

type Role = "CUSTOMER" | "VENDOR" | "ADMIN";

export async function requireRole(roles: Role[]): Promise<Session> {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!roles.includes(session.user.role)) redirect("/dashboard");
  return session;
}

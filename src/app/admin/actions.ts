"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";

export async function setVendorApproval(formData: FormData) {
  await requireRole(["ADMIN"]);
  const vendorId = String(formData.get("vendorId"));
  const approved = formData.get("approved") === "true";
  await db.vendor.update({ where: { id: vendorId }, data: { approved } });
  revalidatePath("/admin");
}

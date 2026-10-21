import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { expirePendingPayments } from "@/lib/payments";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || supplied.length !== secret.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const expired = await expirePendingPayments();
  return NextResponse.json({ expired });
}

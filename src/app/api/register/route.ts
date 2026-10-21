import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/redis";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  role: z.enum(["CUSTOMER", "VENDOR"]),
  shopName: z.string().trim().min(2).max(100).optional(),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers.get("x-forwarded-for"));
  const ipLimit = await rateLimit([`register:ip:${ip}`], 8, 60 * 60);
  if (!ipLimit.allowed) return NextResponse.json({ error: "Too many registration attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid input" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { name, password, role, shopName } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const emailLimit = await rateLimit([`register:user:${email}`], 3, 60 * 60);
  if (!emailLimit.allowed) return NextResponse.json({ error: "Too many registration attempts for this email. Try again later." }, { status: 429, headers: { "Retry-After": String(emailLimit.retryAfterSeconds) } });

  if (role === "VENDOR" && !shopName) {
    return NextResponse.json({ error: "Shop name is required" }, { status: 400 });
  }

  const exists = await db.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const hashed = await bcrypt.hash(password, 10);

  await db.user.create({
    data: {
      name,
      email,
      password: hashed,
      role,
      ...(role === "VENDOR" ? { vendor: { create: { shopName: shopName! } } } : {}),
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

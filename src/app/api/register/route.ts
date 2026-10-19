import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["CUSTOMER", "VENDOR"]),
  shopName: z.string().min(2).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { name, password, role, shopName } = parsed.data;
  const email = parsed.data.email.toLowerCase();

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

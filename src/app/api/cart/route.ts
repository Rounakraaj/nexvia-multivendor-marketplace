import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { clearSignedInCart, mergeSignedInCart, readSignedInCart, replaceSignedInCart } from "@/lib/cart-server";
import { isRedisConfigured } from "@/lib/redis";

async function customerId() {
  const session = await getServerSession(authOptions);
  return session?.user.role === "CUSTOMER" ? session.user.id : null;
}

function localMode() {
  return NextResponse.json({ storage: "local", reason: isRedisConfigured() ? "unavailable" : "unconfigured" }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const userId = await customerId();
  if (!userId) return NextResponse.json({ error: "Customer sign-in required." }, { status: 401 });
  const result = await readSignedInCart(userId);
  if (!result.available) return localMode();
  return NextResponse.json({ storage: "redis", items: result.items }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const userId = await customerId();
  if (!userId) return NextResponse.json({ error: "Customer sign-in required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid cart data." }, { status: 400 }); }
  const items = (body as { items?: unknown } | null)?.items;
  const result = await mergeSignedInCart(userId, items);
  if (result.invalid) return NextResponse.json({ error: "Cart items are invalid." }, { status: 400 });
  if (!result.available) return localMode();
  return NextResponse.json({ storage: "redis", items: result.items }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const userId = await customerId();
  if (!userId) return NextResponse.json({ error: "Customer sign-in required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid cart data." }, { status: 400 }); }
  const items = (body as { items?: unknown } | null)?.items;
  const result = await replaceSignedInCart(userId, items);
  if (result.invalid) return NextResponse.json({ error: "Cart items are invalid." }, { status: 400 });
  if (!result.available) return localMode();
  return NextResponse.json({ storage: "redis", items: result.items }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const userId = await customerId();
  if (!userId) return NextResponse.json({ error: "Customer sign-in required." }, { status: 401 });
  const cleared = await clearSignedInCart(userId);
  if (!cleared) return localMode();
  return NextResponse.json({ storage: "redis", items: [] }, { headers: { "Cache-Control": "no-store" } });
}

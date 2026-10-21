import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProductImageRedirectUrl, isProductImageKeyForVendor } from "@/lib/s3";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key || !key.startsWith("products/")) return NextResponse.json({ error: "Image not found." }, { status: 404 });

  const vendorId = key.split("/")[1] ?? "";
  if (!isProductImageKeyForVendor(key, vendorId)) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  const product = await db.product.findFirst({ where: { image: key, vendor: { approved: true } }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Image not found." }, { status: 404 });

  try {
    const url = await getProductImageRedirectUrl(key);
    if (!url) return NextResponse.json({ error: "Image storage is unavailable." }, { status: 503 });
    return NextResponse.redirect(url, { headers: { "Cache-Control": "private, max-age=240" } });
  } catch {
    return NextResponse.json({ error: "Image storage is temporarily unavailable." }, { status: 503 });
  }
}

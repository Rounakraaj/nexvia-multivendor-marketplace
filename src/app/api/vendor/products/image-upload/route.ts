import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_PRODUCT_IMAGE_BYTES, createProductImageUpload, productImageTypes } from "@/lib/s3";

const uploadSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(MAX_PRODUCT_IMAGE_BYTES),
  productId: z.string().min(1).max(40).optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "VENDOR") {
    return NextResponse.json({ error: "Sign in with an approved vendor account to upload an image." }, { status: 403 });
  }

  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id }, select: { id: true, approved: true } });
  if (!vendor?.approved) return NextResponse.json({ error: "Your vendor account must be approved before uploading images." }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: `Choose a JPEG, PNG, or WebP image smaller than ${MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024} MB.` }, { status: 400 });
  }

  if (parsed.data.productId) {
    const product = await db.product.findFirst({ where: { id: parsed.data.productId, vendorId: vendor.id }, select: { id: true } });
    if (!product) return NextResponse.json({ error: "That product does not belong to your shop." }, { status: 404 });
  }

  try {
    const upload = await createProductImageUpload(vendor.id, parsed.data.contentType as keyof typeof productImageTypes);
    return NextResponse.json(upload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Image storage is unavailable right now. You can still save the product without a new image." }, { status: 503 });
  }
}

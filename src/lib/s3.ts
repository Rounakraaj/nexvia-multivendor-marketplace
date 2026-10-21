import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;
export const productImageTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

const imageKeySchema = z.string().regex(/^products\/[a-zA-Z0-9_-]+\/[0-9a-f-]+\.(jpg|png|webp)$/i);

let client: S3Client | undefined;

function config() {
  const { S3_BUCKET: bucket, S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    client: client ??= new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

export function isProductImageKeyForVendor(key: string, vendorId: string) {
  return imageKeySchema.safeParse(key).success && key.startsWith(`products/${vendorId}/`);
}

export function productImageUrl(key: string) {
  return `/api/product-images?key=${encodeURIComponent(key)}`;
}

export async function createProductImageUpload(vendorId: string, contentType: keyof typeof productImageTypes) {
  const storage = config();
  if (!storage) throw new Error("Image uploads are unavailable. Configure the S3 storage environment variables.");
  const key = `products/${vendorId}/${crypto.randomUUID()}.${productImageTypes[contentType]}`;
  const post = await createPresignedPost(storage.client, {
    Bucket: storage.bucket,
    Key: key,
    Expires: 300,
    Fields: { "Content-Type": contentType },
    Conditions: [
      ["eq", "$Content-Type", contentType],
      ["content-length-range", 1, MAX_PRODUCT_IMAGE_BYTES],
    ],
  });
  return { key, ...post };
}

export async function getProductImageRedirectUrl(key: string) {
  const storage = config();
  if (!storage || !imageKeySchema.safeParse(key).success) return null;
  return getSignedUrl(storage.client, new GetObjectCommand({ Bucket: storage.bucket, Key: key }), { expiresIn: 300 });
}

export async function assertProductImageObject(key: string, vendorId: string) {
  if (!isProductImageKeyForVendor(key, vendorId)) throw new Error("Choose an image uploaded to your shop.");
  const storage = config();
  if (!storage) throw new Error("Image storage is unavailable. Configure S3 before saving this image.");

  const metadata = await storage.client.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: key }));
  if (!metadata.ContentLength || metadata.ContentLength > MAX_PRODUCT_IMAGE_BYTES || metadata.ContentLength < 1) {
    throw new Error("The uploaded image must be no larger than 2 MB.");
  }
  if (!metadata.ContentType || !(metadata.ContentType in productImageTypes)) {
    throw new Error("Upload a JPEG, PNG, or WebP image.");
  }

  const response = await storage.client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: key, Range: "bytes=0-11" }));
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes || !matchesImageSignature(bytes, metadata.ContentType)) {
    throw new Error("The uploaded file does not match its declared image type.");
  }
}

function matchesImageSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (contentType === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

export async function deleteProductImage(key: string) {
  const storage = config();
  if (!storage || !imageKeySchema.safeParse(key).success) return;
  await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }));
}

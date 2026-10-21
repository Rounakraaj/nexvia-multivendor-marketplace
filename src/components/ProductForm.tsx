"use client";

import Image from "next/image";
import { useEffect, useState, type ChangeEvent } from "react";
import PendingSubmitButton from "@/components/PendingSubmitButton";

type Product = {
  id?: string;
  title: string;
  description: string | null;
  price: number;
  stock: number;
  category: string;
  image: string | null;
};

type UploadResponse = {
  key: string;
  url: string;
  fields: Record<string, string>;
  error?: string;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  product?: Product;
};

const initialImageKey = (image: string | null | undefined) => image?.startsWith("products/") ? image : "";
const imageUrl = (key: string) => `/api/product-images?key=${encodeURIComponent(key)}`;

export default function ProductForm({ action, submitLabel, product }: Props) {
  const [imageKey, setImageKey] = useState(() => initialImageKey(product?.image));
  const [preview, setPreview] = useState(() => initialImageKey(product?.image) ? imageUrl(initialImageKey(product?.image)) : "");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  useEffect(() => () => {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setUploadMessage("");
    const types = ["image/jpeg", "image/png", "image/webp"];
    if (!types.includes(file.type) || file.size > 2 * 1024 * 1024 || file.size < 1) {
      setUploadMessage("Choose a JPEG, PNG, or WebP image smaller than 2 MB.");
      event.currentTarget.value = "";
      return;
    }

    setUploading(true);
    try {
      const response = await fetch("/api/vendor/products/image-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size, ...(product?.id ? { productId: product.id } : {}) }),
      });
      const upload = await response.json() as UploadResponse;
      if (!response.ok) throw new Error(upload.error ?? "Image upload could not be started.");

      const body = new FormData();
      for (const [name, value] of Object.entries(upload.fields)) body.append(name, value);
      body.append("file", file);
      const stored = await fetch(upload.url, { method: "POST", body });
      if (!stored.ok) throw new Error("The image could not be stored. Check the S3 bucket CORS settings and try again.");

      setImageKey(upload.key);
      setPreview(URL.createObjectURL(file));
      setUploadMessage("Image uploaded. Save the product to publish it.");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Image storage is temporarily unavailable.");
    } finally {
      setUploading(false);
      event.currentTarget.value = "";
    }
  }

  function removeImage() {
    setImageKey("");
    setPreview("");
    setUploadMessage("The image will be removed when you save the product.");
  }

  return (
    <form action={action} className="grid gap-5 md:grid-cols-2">
      {product?.id && <input type="hidden" name="productId" value={product.id} />}
      <input type="hidden" name="image" value={imageKey} />
      <div>
        <label htmlFor="title" className="label">Title</label>
        <input id="title" name="title" required minLength={2} defaultValue={product?.title} className="field" />
      </div>
      <div>
        <label htmlFor="description" className="label">Description</label>
        <textarea id="description" name="description" rows={4} defaultValue={product?.description ?? ""} className="field" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="price" className="label">Price (INR)</label>
          <input id="price" name="price" type="number" step="0.01" min="0.01" required defaultValue={product?.price} className="field" />
        </div>
        <div>
          <label htmlFor="stock" className="label">Stock</label>
          <input id="stock" name="stock" type="number" min="0" required defaultValue={product?.stock ?? 0} className="field" />
        </div>
      </div>
      <div>
        <label htmlFor="category" className="label">Category</label>
        <input id="category" name="category" required minLength={2} defaultValue={product?.category} placeholder="For example: Electronics" className="field" />
      </div>
      <div>
        <label htmlFor="image-file" className="label">Product image</label>
        <input id="image-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadImage} disabled={uploading} className="field file:mr-3 file:rounded-md file:border-0 file:bg-[var(--surface-2)] file:px-3 file:py-2" />
        <p className="mt-2 text-xs text-[var(--muted)]">JPEG, PNG, or WebP. Maximum 2 MB.</p>
        {uploading && <p role="status" className="mt-2 text-sm text-[var(--muted)]">Uploading image…</p>}
        {uploadMessage && <p role="status" className="mt-2 text-sm text-[var(--muted)]">{uploadMessage}</p>}
        {preview && <div className="relative mt-3 aspect-[4/3] max-w-xs overflow-hidden rounded-xl border border-[var(--line)]">
          <Image src={preview} alt="Product image preview" fill unoptimized className="object-cover" sizes="320px" />
        </div>}
        {imageKey && <button type="button" onClick={removeImage} className="tap-target mt-2 inline-flex items-center text-sm underline underline-offset-4">Remove image</button>}
      </div>
      <div className="md:col-span-2">
        <PendingSubmitButton className="btn btn-primary w-full py-3" label={submitLabel} />
      </div>
    </form>
  );
}

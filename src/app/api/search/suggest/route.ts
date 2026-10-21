import { NextResponse } from "next/server";
import { z } from "zod";
import { suggestProducts } from "@/lib/search";

const querySchema = z.string().trim().min(2).max(80);

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("q"));
  if (!parsed.success) return NextResponse.json({ suggestions: [] });
  try {
    const suggestions = await suggestProducts(parsed.data);
    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ suggestions: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}

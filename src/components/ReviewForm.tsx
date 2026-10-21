"use client";

import { useActionState, useEffect } from "react";
import { submitProductReview, type ReviewActionState } from "@/app/products/actions";
import { showToast } from "@/lib/toast";

export default function ReviewForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(submitProductReview, {});
  useEffect(() => {
    if (state.success) showToast(state.success);
    if (state.error) showToast(state.error, "error");
  }, [state]);
  return <form action={action} className="panel mt-5 space-y-3 p-4">
    <input type="hidden" name="productId" value={productId} />
    <h3 className="font-semibold">Write a review</h3>
    <div><label className="label" htmlFor={`rating-${productId}`}>Rating</label><select className="field" name="rating" id={`rating-${productId}`} defaultValue="5"><option value="5">5 – Excellent</option><option value="4">4 – Good</option><option value="3">3 – Okay</option><option value="2">2 – Poor</option><option value="1">1 – Very poor</option></select></div>
    <div><label className="label" htmlFor={`comment-${productId}`}>Review</label><textarea className="field" name="comment" id={`comment-${productId}`} minLength={5} maxLength={1200} rows={4} required /></div>
    {state.error && <p role="alert" className="text-sm text-[var(--danger)]">{state.error}</p>}
    <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Submit review"}</button>
  </form>;
}

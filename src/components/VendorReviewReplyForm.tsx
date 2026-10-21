"use client";

import { useActionState, useEffect } from "react";
import { replyToProductReview, type ReviewActionState } from "@/app/products/actions";
import { showToast } from "@/lib/toast";

export default function VendorReviewReplyForm({ reviewId, productId }: { reviewId: string; productId: string }) {
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(replyToProductReview, {});
  useEffect(() => {
    if (state.success) showToast(state.success);
    if (state.error) showToast(state.error, "error");
  }, [state]);
  return <form action={action} className="mt-3 space-y-2">
    <input type="hidden" name="reviewId" value={reviewId} /><input type="hidden" name="productId" value={productId} />
    <label className="label" htmlFor={`reply-${reviewId}`}>Reply as the shop</label>
    <textarea className="field" id={`reply-${reviewId}`} name="reply" minLength={2} maxLength={1000} rows={2} required />
    {state.error && <p role="alert" className="text-xs text-[var(--danger)]">{state.error}</p>}
    <button className="btn btn-secondary btn-sm" disabled={pending}>{pending ? "Saving…" : "Reply"}</button>
  </form>;
}

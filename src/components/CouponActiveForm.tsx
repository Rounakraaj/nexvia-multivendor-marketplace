"use client";

import { changeCouponActive } from "@/app/admin/actions";

export default function CouponActiveForm({ id, active }: { id: string; active: boolean }) {
  return <form action={changeCouponActive}>
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="active" value={String(!active)} />
    <button className="btn btn-secondary btn-sm">{active ? "Deactivate" : "Activate"}</button>
  </form>;
}

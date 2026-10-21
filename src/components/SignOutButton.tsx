"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button onClick={() => signOut({ callbackUrl: "/login" })} className="btn btn-secondary btn-sm">
      Sign out
    </button>
  );
}

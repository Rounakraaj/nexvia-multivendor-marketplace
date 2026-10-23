import Link from "next/link";
import { getSession } from "@/lib/session";
import { authOptions } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";
import CartLink from "@/components/CartLink";
import SearchForm from "@/components/SearchForm";

export default async function SiteHeader({ showSearch = true }: { showSearch?: boolean }) {
  const session = await getSession();
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-black">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
        <Link href="/" className="tap-target flex shrink-0 items-center text-lg font-extrabold tracking-[-0.03em]">Nexvia Market</Link>
        {showSearch && <div className="order-last basis-full md:order-none md:basis-0 md:flex-1"><SearchForm compact /></div>}
        <nav className="ml-auto flex items-center gap-2" aria-label="Account">
          <CartLink />
          {session ? <>
            {session.user.role === "CUSTOMER" && <Link href="/orders" className="btn btn-secondary btn-sm">Orders</Link>}
            {session.user.role !== "CUSTOMER" && <Link href="/dashboard" className="btn btn-secondary btn-sm">{session.user.role === "ADMIN" ? "Admin" : "My shop"}</Link>}
            <SignOutButton />
          </> : <>
            <Link href="/login" className="btn btn-secondary btn-sm">Sign in</Link>
            <Link href="/register" className="btn btn-primary btn-sm">Create account</Link>
          </>}
        </nav>
      </div>
    </header>
  );
}

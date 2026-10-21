import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-[var(--line)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm">
        <div><p className="text-lg font-bold">Nexvia Market</p><p className="mt-1 text-[var(--muted)]">A clear split for every order.</p></div>
        <nav className="flex flex-wrap gap-6 text-[var(--muted)]">
          <Link href="/" className="tap-target inline-flex items-center px-1 hover:text-[var(--text)]">Shop</Link><Link href="/cart" className="tap-target inline-flex items-center px-1 hover:text-[var(--text)]">Cart</Link><Link href="/register" className="tap-target inline-flex items-center px-1 hover:text-[var(--text)]">Sell on Nexvia</Link>
        </nav>
        <p className="text-[var(--muted)]">Built as a capstone project.</p>
      </div>
    </footer>
  );
}

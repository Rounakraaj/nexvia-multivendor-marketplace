"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; exact?: boolean };

export default function SidebarNav({ items }: { items: Item[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Dashboard">
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`relative min-h-11 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${
              active ? "bg-[var(--surface-2)] text-[var(--lime)] lg:before:absolute lg:before:inset-y-2 lg:before:left-0 lg:before:w-[3px] lg:before:rounded-full lg:before:bg-[var(--lime)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            }`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

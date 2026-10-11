"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ap } from "@/lib/adminPath";

const NAV = [
  { href: "/admin/performance", label: "Performance" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/search", label: "Search" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/templates", label: "Explore" },
  { href: "/admin/blog", label: "Blog" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-6 max-w-6xl mx-auto">
          <span className="font-semibold text-sm text-zinc-500 tracking-widest uppercase">
            Admin
          </span>
          <nav className="flex gap-4">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={ap(n.href)}
                className={`text-sm ${
                  pathname?.startsWith(ap(n.href))
                    ? "text-amber-400 font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

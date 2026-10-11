import Link from "next/link";
import { Logo } from "@/components/Logo";

export function BlogHeader() {
  return (
    <header
      className="nav-glass sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6 lg:px-8"
      style={{ height: "56px" }}
    >
      <div className="inline-flex items-center gap-2.5">
        <Link href="/" className="no-underline flex-shrink-0">
          <Logo width={24} height={24} iconOnly />
        </Link>
        <span className="text-sm font-medium text-zinc-400">/</span>
        <Link
          href="/blog"
          className="text-[15px] font-semibold text-zinc-900 no-underline hover:text-zinc-600 transition-colors"
        >
          블로그
        </Link>
      </div>

      <Link
        href="/"
        className="text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
      >
        zeriv.io
      </Link>
    </header>
  );
}

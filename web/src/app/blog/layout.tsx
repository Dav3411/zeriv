import type { Metadata } from "next";
import { BlogHeader } from "@/components/BlogHeader";
import { ForceLight } from "@/components/ForceLight";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

export const metadata: Metadata = {
  alternates: {
    types: {
      "application/rss+xml": `${SITE_URL}/blog/rss.xml`,
    },
  },
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh" style={{ background: "#f5f4f4" }}>
      <ForceLight />
      <BlogHeader />
      <main className="pt-0">{children}</main>
    </div>
  );
}

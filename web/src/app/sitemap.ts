import { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const baseUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");

export const revalidate = 300;

async function fetchBlogEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const { data, error } = await supabaseAdmin
      .from("blog_posts")
      .select("slug, published_at, updated_at, tags, author_name")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];

    const postEntries: MetadataRoute.Sitemap = data.map((row) => ({
      url: `${baseUrl}/blog/${row.slug as string}`,
      lastModified: new Date(
        (row.updated_at as string) ?? (row.published_at as string),
      ),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    // 태그 페이지 — unique tags
    const uniqueTags = [
      ...new Set(
        (data as { tags: string[] | null }[]).flatMap((r) => r.tags ?? []),
      ),
    ];
    const tagEntries: MetadataRoute.Sitemap = uniqueTags.map((tag) => ({
      url: `${baseUrl}/blog/tag/${encodeURIComponent(tag)}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));

    // 저자 페이지 — unique author_names → slug 변환
    const { authorNameToSlug } = await import("@/lib/blogAuthors");
    const uniqueAuthors = [
      ...new Set((data as { author_name: string }[]).map((r) => r.author_name)),
    ];
    const authorEntries: MetadataRoute.Sitemap = uniqueAuthors.map((name) => ({
      url: `${baseUrl}/blog/author/${authorNameToSlug(name)}`,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    }));

    return [...postEntries, ...tagEntries, ...authorEntries];
  } catch (e) {
    console.error("[sitemap] blog fetch failed:", e);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const blogEntries = await fetchBlogEntries();

  return [
    {
      url: baseUrl,
      lastModified: new Date("2026-05-02"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date("2025-01-01"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date("2025-01-01"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/agents`,
      lastModified: new Date("2025-01-01"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/create`,
      lastModified: new Date("2025-01-01"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/tools/coupang-thumbnail-size`,
      lastModified: new Date("2026-05-21"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...blogEntries,
  ];
}

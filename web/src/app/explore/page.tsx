/* eslint-disable @next/next/no-img-element */
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { Logo } from "@/components/Logo";
import { PhotoPreviewModal } from "@/components/PhotoPreviewModal";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { getLastBrandId } from "@/components/BrandProvider";

type TemplateItem = {
  id: string;
  name: string;
  category: string | null;
  key_visual_url: string | null;
  example_images: string[];
  mood_keywords: string[];
};

type GalleryCard = {
  templateId: string;
  template: TemplateItem;
  src: string;
};

const CATEGORIES = [
  { key: "all", label: "전체" },
  { key: "clean", label: "클린/미니멀" },
  { key: "aqua", label: "아쿠아/크리스탈" },
  { key: "natural", label: "내추럴/오가닉" },
  { key: "romantic", label: "로맨틱/플로럴" },
  { key: "vivid", label: "비비드/팝" },
  { key: "luxury", label: "럭셔리/다크" },
] as const;

function FadeInSection({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
    >
      {children}
    </div>
  );
}

function ImageCard({
  src,
  category,
  title,
  onClick,
}: {
  src: string;
  category: string;
  title: string;
  onClick?: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="group relative w-full overflow-hidden rounded-none cursor-pointer"
      style={{ background: "var(--surface-1)" }}
      onClick={onClick}
    >
      {!imgError ? (
        <img
          src={src}
          alt={title}
          className="w-full h-auto block transition-transform duration-500 group-hover:scale-[1.06]"
          style={{ minHeight: "120px" }}
          loading="lazy"
          decoding="async"
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className="w-full aspect-[4/5] flex flex-col items-center justify-center gap-1.5"
          style={{ background: "var(--surface-1)" }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--accent-subtle)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.5 }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{category}</span>
        </div>
      )}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />
      <div
        className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity delay-75 pointer-events-none"
        style={{
          background: "var(--accent-subtle)",
          border: "1px solid var(--border-accent)",
          color: "var(--accent)",
        }}
      >
        {category}
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-1.5 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
        <p className="text-[11px] font-semibold text-always-white leading-tight truncate">
          {title}
        </p>
        <p
          className="text-[10px] mt-0.5"
          style={{ color: "rgba(255,164,198,0.6)" }}
        >
          {category}
        </p>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="w-full aspect-[4/5]" style={{ background: "var(--surface-2)" }}>
      <div
        className="w-full h-full animate-pulse"
        style={{ background: "var(--surface-3)" }}
      />
    </div>
  );
}

function getActiveBrandIdFromClient(
  searchParams: URLSearchParams | null,
  userId: string | null,
): string | null {
  // 1. URL query param
  const fromUrl = searchParams?.get("brand")?.trim();
  if (fromUrl) return fromUrl;
  // 2. localStorage (user-scoped)
  return getLastBrandId(userId);
}

function ExplorePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeCategory, setActiveCategory] = useState("all");
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<GalleryCard | null>(null);
  const [applying, setApplying] = useState(false);
  const { user } = useAuth();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    requestAnimationFrame(update);
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  // 발견(explore) 글로벌 템플릿은 모든 계정에서 별도의 "저장" 없이
  // 즉시 사용 가능. 따라서 이 페이지에서는 brand_style_saves 와 관련된
  // 저장 상태/저장 버튼을 다루지 않는다. brandId 결정 후 곧바로
  // 스튜디오로 이동하면서 styleId 쿼리로 선택 상태를 전달한다.
  async function handleApply() {
    if (!selectedCard) return;
    if (applying) return;
    setApplying(true);
    try {
      // 1) 로그인 확인 — 비로그인 사용자는 로그인 후 explore 로 복귀
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        router.push("/login?next=/explore");
        return;
      }

      // 2) 활성 brandId 결정: URL ?brand= → localStorage → 사용자 첫 brand
      let brandId: string | null = getActiveBrandIdFromClient(
        searchParams,
        user?.id ?? null,
      );

      if (!brandId) {
        const { data: brands } = await supabase
          .from("brands")
          .select("id")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: true })
          .limit(1);

        if (!brands || brands.length === 0) {
          router.push("/brands/new");
          return;
        }
        brandId = brands[0].id as string;
      }

      router.push(`/${brandId}/studio?styleId=${selectedCard.template.id}`);
    } finally {
      setApplying(false);
    }
  }

  useEffect(() => {
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => {
        const raw: TemplateItem[] = data.templates ?? [];
        // 최초 로드 시 1회 shuffle
        for (let i = raw.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [raw[i], raw[j]] = [raw[j], raw[i]];
        }
        setTemplates(raw);
      })
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, []);

  const displayTemplates = useMemo(
    () =>
      activeCategory === "all"
        ? templates
        : templates.filter(
            (t) =>
              t.category ===
              CATEGORIES.find((c) => c.key === activeCategory)?.label,
          ),
    [templates, activeCategory],
  );

  const displayCards: GalleryCard[] = useMemo(() => {
    const cards: GalleryCard[] = displayTemplates.flatMap((t) => {
      const result: GalleryCard[] = [];
      const seen = new Set<string>();
      // key_visual_url을 첫 번째로 추가
      if (t.key_visual_url && !seen.has(t.key_visual_url)) {
        seen.add(t.key_visual_url);
        result.push({ templateId: t.id, template: t, src: t.key_visual_url });
      }
      for (const src of t.example_images) {
        if (src && !seen.has(src)) {
          seen.add(src);
          result.push({ templateId: t.id, template: t, src });
        }
      }
      return result;
    });
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }, [displayTemplates]);

  return (
    <div className="min-h-dvh" style={{ background: "var(--background)" }}>
      <SiteHeader />

      {/* 카테고리 필터 바 — breadcrumb 자리를 대체 */}
      <div
        className="fixed top-[52px] lg:top-0 right-0 z-40 flex items-center h-11 lg:h-14 px-4 sm:px-6 lg:px-12 left-0 lg:left-[var(--sidebar-active-w,var(--sidebar-w-collapsed))] filter-bar-gradient overflow-hidden"
      >
        <div
          ref={scrollRef}
          className="flex gap-6 lg:gap-12 overflow-x-auto scrollbar-hide w-full"
        >
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className="shrink-0 text-sm lg:text-base font-medium transition-all duration-200 whitespace-nowrap"
                style={{
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* 좌측 페이드 — lg에서만 숨김 */}
        <div
          className="absolute left-0 top-0 h-full w-6 pointer-events-none lg:hidden transition-opacity duration-200"
          style={{
            opacity: canScrollLeft ? 1 : 0,
            background: `linear-gradient(to right, var(--fade-edge-color, rgba(0,0,0,0.95)), transparent)`,
          }}
        />

        {/* 우측 페이드 */}
        <div
          className="absolute right-0 top-0 h-full w-10 pointer-events-none lg:hidden transition-opacity duration-200"
          style={{
            opacity: canScrollRight ? 1 : 0,
            background: `linear-gradient(to left, var(--fade-edge-color, rgba(0,0,0,0.95)), transparent)`,
          }}
        />

        {/* 우측 화살표 */}
        <div
          className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none lg:hidden transition-opacity duration-200"
          style={{ opacity: canScrollRight ? 1 : 0, color: "var(--text-secondary)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>

      {/* 갤러리 — SiteHeader top bar 높이만큼 상단 여백 */}
      <main
        className="pt-[88px] lg:pt-14 lg:pl-[var(--sidebar-active-w,var(--sidebar-w-collapsed))]"
      >
        {templatesLoading ? (
          <div className="columns-2 sm:columns-3 lg:columns-3 xl:columns-4 gap-[3px] [column-fill:balance]">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="break-inside-avoid mb-[3px]">
                <SkeletonCard />
              </div>
            ))}
          </div>
        ) : (
          <FadeInSection key={activeCategory} delay={60}>
            {displayCards.length === 0 ? (
              <div className="px-4 sm:px-6 py-16">
                <div
                  className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px dashed var(--border-default)",
                  }}
                >
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    아직 등록된 템플릿이 없습니다
                  </p>
                </div>
              </div>
            ) : (
              <div className="columns-2 sm:columns-3 lg:columns-3 xl:columns-4 gap-[3px] [column-fill:balance]">
                {displayCards.map((card) => (
                  <div
                    key={`${card.templateId}-${card.src}`}
                    className="break-inside-avoid mb-[3px]"
                  >
                    <ImageCard
                      src={card.src}
                      category={card.template.category ?? ""}
                      title={card.template.name}
                      onClick={() => setSelectedCard(card)}
                    />
                  </div>
                ))}
              </div>
            )}
          </FadeInSection>
        )}

        {/* 서비스 푸터 */}
        <footer
          className="px-6 pt-10 pb-[calc(2.5rem+56px+env(safe-area-inset-bottom))] lg:pb-10 mt-[3px]"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <div className="mx-auto max-w-[960px] space-y-6">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <Logo width={100} height={24} />
              <div
                className="flex items-center gap-6 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                <Link
                  href="/terms"
                  className="transition-colors hover:text-[color:var(--text-primary)]"
                >
                  이용약관
                </Link>
                <Link
                  href="/privacy"
                  className="transition-colors hover:text-[color:var(--text-primary)]"
                >
                  개인정보처리방침
                </Link>
                <Link
                  href="/pricing"
                  className="transition-colors hover:text-[color:var(--text-primary)]"
                >
                  요금제
                </Link>
              </div>
              <span
                className="text-xs"
                style={{ color: "var(--text-muted)", opacity: 0.65 }}
              >
                © 2026 Zeriv. All rights reserved.
              </span>
            </div>
            <div
              className="text-[11px] leading-relaxed"
              style={{
                color: "var(--text-muted)",
                opacity: 0.65,
                borderTop: "1px solid var(--border-subtle)",
                paddingTop: "16px",
              }}
            >
              <p>
                상호: 예시 사업자 &nbsp;|&nbsp; 대표자: 예시 대표자
                &nbsp;|&nbsp; 사업자등록번호: 000-00-00000
              </p>
              <p className="mt-1">
                사업장소재지: 예시 사업장 주소
              </p>
              <p className="mt-1">
                이메일: support@example.com &nbsp;|&nbsp; 전화: 000-0000-0000
              </p>
              <p className="mt-1">
                통신판매업 신고번호: 예시 신고번호 &nbsp;|&nbsp;{" "}
                <a
                  href="https://www.ftc.go.kr/bizCommPop.do?wrkr_no=0000000000"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-[color:var(--text-primary)]"
                  style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                  사업자정보확인
                </a>
              </p>
            </div>
          </div>
        </footer>
      </main>

      {/* 템플릿 상세 모달 */}
      {selectedCard && (
        <PhotoPreviewModal
          imageUrl={selectedCard.src}
          styleName={selectedCard.template.name}
          styleCategory={selectedCard.template.category ?? undefined}
          styleMoodKeywords={selectedCard.template.mood_keywords}
          styleImageUrl={selectedCard.template.key_visual_url}
          onClose={() => setSelectedCard(null)}
          footer={
            <div className="mt-5 space-y-2">
              <button
                onClick={handleApply}
                disabled={applying}
                aria-busy={applying}
                className="w-full flex items-center justify-between pl-6 pr-2 py-3.5 rounded-full text-sm font-bold transition-all duration-150 active:scale-[0.97] hover:brightness-105 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                  color: "#000",
                  boxShadow: "0 4px 20px rgba(255,164,198,0.25)",
                }}
              >
                {applying ? "이동 중..." : "이 스타일로 생성"}
                <span className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center shrink-0">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#000"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            </div>
          }
        />
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={null}>
      <ExplorePageContent />
    </Suspense>
  );
}

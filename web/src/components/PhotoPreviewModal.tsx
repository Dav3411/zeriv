"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

export type PhotoPreviewModalProps = {
  imageUrl: string;
  // Style 정보
  styleName?: string | null;
  styleCategory?: string | null;
  styleMoodKeywords?: string[];
  styleImageUrl?: string | null;
  styleId?: string | null;
  styleAction?: React.ReactNode; // 스타일 이름 행 우측 액션 버튼 슬롯
  // Model 정보
  modelName?: string | null;
  modelImageUrl?: string | null;
  modelId?: string | null;
  // Product 정보
  productName?: string | null;
  productCategory?: string | null;
  productImageUrl?: string | null;
  productId?: string | null;
  onClose: () => void;
  // CTA 슬롯 (explore: "스타일 사용하기", assets: "다운로드", studio: 없음)
  footer?: React.ReactNode;
};

export function PhotoPreviewModal({
  imageUrl,
  styleName,
  styleCategory,
  styleMoodKeywords,
  styleImageUrl,
  styleId,
  styleAction,
  modelName,
  modelImageUrl,
  modelId,
  productName,
  productCategory,
  productImageUrl,
  productId,
  onClose,
  footer,
}: PhotoPreviewModalProps) {
  const router = useRouter();
  const params = useParams();
  const brandName = params.brandName as string | undefined;
  const [visible, setVisible] = useState(false);

  // 진입 애니메이션
  useEffect(() => {
    let id1: number, id2: number;
    id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, []);

  // ESC 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // 스크롤 잠금
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const hasModel = !!modelName;
  const hasProduct = !!productName;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden overscroll-contain transition-opacity duration-200 ease-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ background: "var(--surface-0)" }}
    >
      {/* ── 좌측: 이미지 ── */}
      <div
        className="relative w-full flex-none lg:flex-1 min-w-0 overflow-hidden"
        style={{ background: "#000" }}
      >
        {/* 뒤로가기 버튼 */}
        <button
          onClick={onClose}
          aria-label="뒤로가기"
          className="absolute top-5 left-5 z-10 flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium text-white transition-all duration-150 bg-white/[0.06] border border-white/10 hover:bg-white/[0.10]"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          돌아가기
        </button>

        {/* 이미지 (원본 비율 유지) */}
        <div className="relative w-full lg:h-full lg:absolute lg:inset-0">
          <img
            src={imageUrl}
            alt={styleName ?? ""}
            className="block w-full h-auto lg:w-full lg:h-full"
            style={{ objectFit: "contain", objectPosition: "center" }}
          />
        </div>
      </div>

      {/* ── 우측: 정보 패널 ── */}
      <div
        className="w-full lg:w-[380px] lg:shrink-0 flex flex-col lg:overflow-y-auto"
        style={{
          background: "var(--surface-1)",
          borderLeft: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex flex-col flex-1 p-7 gap-0">
          {/* 스타일 섹션 — 데이터 있을 때만 */}
          {styleName && (
            <>
              <p
                className="text-[11px] uppercase tracking-widest font-semibold mb-5"
                style={{ color: "rgba(255,164,198,0.45)" }}
              >
                스타일
              </p>

              {/* 미리보기 이미지 */}
              {styleImageUrl && (
                <div className="w-full aspect-video rounded-xl overflow-hidden mb-4">
                  <img
                    src={styleImageUrl}
                    alt={styleName ?? ""}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* 스타일 이름 + 액션 버튼 같은 행 */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2
                  className={`text-xl font-bold leading-snug truncate ${styleId && brandName ? "cursor-pointer hover:underline" : ""}`}
                  style={{ color: "var(--text-primary)" }}
                  onClick={
                    styleId && brandName
                      ? () => {
                          onClose();
                          router.push(`/${brandName}/styles/${styleId}`);
                        }
                      : undefined
                  }
                >
                  {styleName}
                </h2>
                {styleAction && <div className="shrink-0">{styleAction}</div>}
              </div>

              {styleCategory && (
                <span
                  className="self-start px-3 py-1 rounded-full text-xs font-medium mb-5"
                  style={{
                    background: "rgba(255,164,198,0.12)",
                    border: "1px solid rgba(255,164,198,0.35)",
                    color: "#ffa4c6",
                  }}
                >
                  {styleCategory}
                </span>
              )}
              {styleMoodKeywords && styleMoodKeywords.length > 0 && (
                <div className="mb-7">
                  <p
                    className="text-[11px] uppercase tracking-widest font-semibold mb-2.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    분위기
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {styleMoodKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium"
                        style={{
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        #{kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 구분선 — 모델 또는 제품 데이터가 있을 때만 */}
          {(hasModel || hasProduct) && (
            <div
              className="mb-6"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            />
          )}

          {/* 모델 섹션 — 데이터 있을 때만 */}
          {hasModel && (
            <div className="mb-6">
              <p
                className="text-[11px] uppercase tracking-widest font-semibold mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                모델
              </p>
              {hasModel ? (
                <div
                  className={`flex items-center gap-3 p-3 rounded-xl transition-filter ${modelId && brandName ? "cursor-pointer hover:brightness-110" : ""}`}
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                  }}
                  onClick={
                    modelId && brandName
                      ? () => {
                          onClose();
                          router.push(`/${brandName}/models/${modelId}`);
                        }
                      : undefined
                  }
                >
                  {modelImageUrl ? (
                    <img
                      src={modelImageUrl}
                      alt={modelName!}
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                      style={{ border: "1px solid var(--border-default)" }}
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center"
                      style={{
                        background: "rgba(255,164,198,0.1)",
                        border: "1px solid rgba(255,164,198,0.2)",
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#ffa4c6"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                  )}
                  <span
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {modelName}
                  </span>
                </div>
              ) : (
                <div
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    모델 정보가 없습니다
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
              )}
            </div>
          )}

          {/* 제품 섹션 — 데이터 있을 때만 */}
          {hasProduct && (
            <div className="mb-6">
              <p
                className="text-[11px] uppercase tracking-widest font-semibold mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                제품
              </p>
              {hasProduct ? (
                <div
                  className={`flex items-center gap-3 p-3 rounded-xl transition-filter ${productId && brandName ? "cursor-pointer hover:brightness-110" : ""}`}
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                  }}
                  onClick={
                    productId && brandName
                      ? () => {
                          onClose();
                          router.push(`/${brandName}/products/${productId}`);
                        }
                      : undefined
                  }
                >
                  {productImageUrl ? (
                    <img
                      src={productImageUrl}
                      alt={productName!}
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                      style={{ border: "1px solid var(--border-default)" }}
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </svg>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {productName}
                    </p>
                    {productCategory && (
                      <p
                        className="text-[11px] mt-0.5"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {productCategory}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    제품 정보가 없습니다
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
              )}
            </div>
          )}

          {/* spacer */}
          <div className="flex-1" />

          {/* footer (CTA) */}
          {footer && <div>{footer}</div>}
        </div>
      </div>
    </div>
  );
}

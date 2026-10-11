"use client";

// 좌측 목록 패널. 헤더 액션 + 행 목록 + 드롭존.
//
// 드롭존 표시 정책:
//  - items 가 비어있으면 패널 전체를 큰 빈 상태 드롭존으로 표시
//  - items 가 있으면 목록 하단에 작은 "+ 이미지 추가" 드롭존 표시
//
// 파일 검증:
//  - useQuickItems.addFiles 가 type 시작 "image/" / size <= 20MB 를 사전 필터링.
//  - 여기서는 사용자에게 보일 안내 텍스트(JPG/PNG/WEBP, 20MB)만 노출.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { FormatKey, QuickItem } from "./types";
import ItemRow from "./ItemRow";
import FormatDropdown from "./FormatDropdown";
import FormatInlineOptions from "./FormatInlineOptions";

interface Props {
  items: QuickItem[];
  selectedIds: Set<string>;
  detailItemId: string | null;
  onAddFiles: (files: File[]) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onRemove: (id: string) => void;
  onUpdateItem: (id: string, patch: Partial<QuickItem>) => void;
  onClickDetail: (id: string) => void;
  /** "workspace"(기본) vs "guest": 빈 상태 안내·제한 텍스트 분기. */
  mode?: "workspace" | "guest";
}

/**
 * ExampleGallery — 감성컷/모델컷/누끼컷 3장 예시 갤러리.
 * workspace / guest 두 모드에서 공유하되 뱃지 색상과 카드 레이블 폰트를 mode로 분기.
 *
 * 순서:
 *   - workspace: 갤러리 → 구분선 → 업로드 안내  (호출부에서 섞어 렌더)
 *   - guest:     업로드 안내 → 구분선 → 갤러리   (호출부에서 섞어 렌더)
 * 본 컴포넌트는 갤러리 블록만 담당한다.
 */
function ExampleGallery({ mode }: { mode: "workspace" | "guest" }) {
  const isGuest = mode === "guest";

  // 카드 레이블 — guest: 11px/500, workspace: 12px(text-xs)/500
  const labelStyle: React.CSSProperties = isGuest
    ? { fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }
    : { color: "var(--text-secondary)" };
  const labelClassName = isGuest ? undefined : "text-xs font-medium";

  // 누끼컷 뱃지 색상
  const badgeStyle: React.CSSProperties = isGuest
    ? {
        background: "#FCE6EC",
        color: "#C25A7E",
        border: "1px solid #F6CFDA",
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "100%",
      }
    : {
        background: "rgba(255,164,198,0.12)",
        color: "#ffa4c6",
        border: "1px solid rgba(255,164,198,0.25)",
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "100%",
      };

  return (
    <div
      className="flex flex-col items-center gap-3 w-full"
      style={{
        opacity: isGuest ? 0.85 : 1,
        display: "var(--dz-gallery-display)" as CSSProperties["display"],
      }}
    >
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "var(--quick-text-gallery-label)",
          fontWeight: 500,
          letterSpacing: isGuest ? "0.04em" : undefined,
          textTransform: isGuest ? "uppercase" : undefined,
          display: "var(--dz-gallery-label-display)" as CSSProperties["display"],
        }}
      >
        이런 썸네일을 만들 수 있어요
      </p>
      <div
        className="flex w-full px-2 md:px-4 md:max-w-[700px]"
        style={{ gap: "var(--dz-gallery-gap)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 감성컷 */}
        <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/quick/moodcut.png"
            alt="감성컷"
            className="w-full aspect-square object-cover"
            style={{
              maxWidth: "var(--dz-gallery-img)",
              borderRadius: 14,
              border: "1px solid var(--border-subtle)",
              background: "var(--surface-2)",
            }}
          />
          <span className={labelClassName} style={labelStyle}>
            감성컷
          </span>
        </div>
        {/* 모델컷 */}
        <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/quick/modelcut.png"
            alt="모델컷"
            className="w-full aspect-square object-cover"
            style={{
              maxWidth: "var(--dz-gallery-img)",
              borderRadius: 14,
              border: "1px solid var(--border-subtle)",
              background: "var(--surface-2)",
            }}
          />
          <div className="flex flex-col items-center gap-1">
            <span className={labelClassName} style={labelStyle}>
              모델컷
            </span>
          </div>
        </div>
        {/* 누끼컷 */}
        <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/quick/multicut.png"
            alt="누끼컷"
            className="w-full aspect-square object-cover"
            style={{
              maxWidth: "var(--dz-gallery-img)",
              borderRadius: 14,
              border: "1px solid var(--border-subtle)",
              background: "var(--surface-2)",
            }}
          />
          <div className="flex flex-col items-center gap-1 min-w-0 w-full">
            <span className={labelClassName} style={labelStyle}>
              누끼컷
            </span>
            <span style={badgeStyle} title="쿠팡 썸네일 기준 충족">쿠팡 썸네일 기준 충족</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 20;

export default function ItemListPanel({
  items,
  selectedIds,
  detailItemId,
  onAddFiles,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onRemove,
  onUpdateItem,
  onClickDetail,
  mode = "workspace",
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [page, setPage] = useState(1);

  // 선택된 아이템에서 bulk 컨트롤 값을 파생한다.
  // 선택이 없으면 기본값("mood"), 혼합이면 null (중립 상태).
  const selectedItems = items.filter((i) => selectedIds.has(i.id));

  const formatValues = new Set(selectedItems.map((i) => i.format));
  const effectiveBulkFormat: FormatKey | null =
    selectedItems.length === 0
      ? "mood"
      : formatValues.size === 1
        ? (formatValues.values().next().value as FormatKey)
        : null;

  const genderValues = new Set(selectedItems.map((i) => i.gender));
  const effectiveBulkGender =
    genderValues.size === 1 ? genderValues.values().next().value : null;

  const countValues = new Set(selectedItems.map((i) => i.count));
  const effectiveBulkCount =
    countValues.size === 1 ? countValues.values().next().value : null;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 삭제 등으로 페이지가 줄어들 때 마지막 페이지로 보정
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [items.length, totalPages, page]);

  // 아이템이 추가될 때 마지막 페이지로 이동
  const prevLengthRef = useRef(items.length);
  useEffect(() => {
    if (items.length > prevLengthRef.current) {
      setPage(Math.ceil(items.length / PAGE_SIZE));
    }
    prevLengthRef.current = items.length;
  }, [items.length]);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    onAddFiles(Array.from(fileList));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const triggerPicker = () => fileInputRef.current?.click();

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const hasItems = items.length > 0;

  return (
    <section className="flex flex-col flex-1 min-h-0">
      {/* 브레드크럼 헤더: 이미지가 있을 때만 표시 */}
      {hasItems && (
        <div
          className="flex items-center gap-2 px-4 py-2 border-b shrink-0"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {/* 왼쪽: 전체선택 + 페이지네이션 — shrink-0으로 고정 */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={allSelected ? onDeselectAll : onSelectAll}
              className="text-xs px-2.5 py-1.5 rounded-lg transition-colors min-h-[36px]"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              {allSelected ? "전체해제" : "전체선택"}
            </button>
            {totalPages > 1 && (
              <>
                {/* 모바일: 콤팩트 ‹ N/M › */}
                <div className="flex items-center gap-0.5 md:hidden">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-xs rounded disabled:opacity-30 transition-colors hover:bg-[var(--accent-subtle)]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    ‹
                  </button>
                  <span
                    className="text-xs tabular-nums"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {page}/{totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-xs rounded disabled:opacity-30 transition-colors hover:bg-[var(--accent-subtle)]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    ›
                  </button>
                </div>
                {/* 데스크톱: 번호 전체 나열 */}
                <div className="hidden md:flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-xs rounded disabled:opacity-30 transition-colors hover:bg-[var(--accent-subtle)]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    ‹
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        className="min-w-[32px] min-h-[32px] inline-flex items-center justify-center text-xs rounded transition-colors"
                        style={{
                          background:
                            p === page
                              ? mode === "guest"
                                ? "rgba(194,90,126,0.12)"
                                : "rgba(255,164,198,0.15)"
                              : "transparent",
                          color:
                            p === page
                              ? mode === "guest"
                                ? "#C25A7E"
                                : "#ffa4c6"
                              : "var(--text-muted)",
                          fontWeight: p === page ? 600 : 400,
                        }}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={page === totalPages}
                    className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-xs rounded disabled:opacity-30 transition-colors hover:bg-[var(--accent-subtle)]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    ›
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 가운데 spacer — 오른쪽 그룹(옵션/삭제)을 우측 끝으로 밀어준다 */}
          <div className="flex-1" />

          {/* 오른쪽: 카운트 + 일괄 형식 드롭다운 + 인라인 옵션 + 일괄 삭제
               모바일에서 잘릴 수 있으므로 이 그룹만 가로 스크롤 허용 */}
          <div className="flex items-center gap-2 overflow-x-auto">
            <span
              className="text-xs shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              {selectedIds.size > 0
                ? `선택 ${selectedIds.size}개 / ${items.length}개`
                : `${items.length}개`}
            </span>

            <FormatDropdown
              value={effectiveBulkFormat}
              onChange={(f: FormatKey) => {
                for (const id of selectedIds) {
                  onUpdateItem(id, { format: f });
                }
              }}
              disabled={selectedIds.size === 0}
            />

            <FormatInlineOptions
              item={
                {
                  format: effectiveBulkFormat,
                  gender: effectiveBulkGender,
                  count: effectiveBulkCount,
                } as QuickItem
              }
              onChange={(patch) => {
                for (const id of selectedIds) {
                  onUpdateItem(id, patch);
                }
              }}
              disabled={selectedIds.size === 0}
            />

            <button
              type="button"
              onClick={() => {
                for (const id of [...selectedIds]) {
                  onRemove(id);
                }
              }}
              disabled={selectedIds.size === 0}
              aria-label="선택 항목 삭제"
              className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-400/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
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
                aria-hidden="true"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 본문: 빈 상태 큰 드롭존 OR 행 목록 + 작은 드롭존 */}
      {!hasItems ? (
        <div
          className="flex flex-1"
          style={{
            paddingTop: "var(--dz-panel-p)",
            paddingBottom: "var(--dz-panel-p)",
          }}
        >
          {(() => {
            // hover/drag 배경·보더·그림자를 모두 토큰(var(--accent-*), var(--border-accent))으로 통일해
            // 다크/라이트 양쪽에서 자동 분기되도록 함.
            const dropzoneColors = {
              borderHoverDrag: "var(--border-accent)",
              bgHover: "var(--accent-subtle)",
              bgDrag: "var(--accent-overlay)",
              shadowBase:
                "0 1px 3px rgba(20,16,24,0.06), 0 4px 12px -4px rgba(20,16,24,0.08)",
              shadowHover:
                "0 2px 6px rgba(20,16,24,0.08), 0 12px 28px -8px rgba(20,16,24,0.14)",
              shadowDrag:
                "0 4px 12px rgba(20,16,24,0.10), 0 20px 40px -10px var(--accent-glow)",
            };
            return (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
              // drag 시작 시 hover 상태 강제 해제 — 둘 다 true 면 상태가 모호해진다.
              if (isHovering) setIsHovering(false);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={triggerPicker}
            className="flex flex-1 flex-col items-center justify-center rounded-2xl cursor-pointer"
            style={{
              transition: "all 150ms ease",
              color: "var(--text-muted)",
              gap: "var(--dz-gap)",
              ...(isDragging
                ? {
                    borderWidth: 1.5,
                    borderStyle: "dashed",
                    borderColor: dropzoneColors.borderHoverDrag,
                    background: dropzoneColors.bgDrag,
                    paddingTop: "var(--dz-pt)",
                    paddingBottom: "var(--dz-pb)",
                    paddingLeft: "var(--dz-px)",
                    paddingRight: "var(--dz-px)",
                    boxShadow: dropzoneColors.shadowDrag,
                  }
                : isHovering
                  ? {
                      borderWidth: 1.5,
                      borderStyle: "dashed",
                      borderColor: dropzoneColors.borderHoverDrag,
                      background: dropzoneColors.bgHover,
                      paddingTop: "var(--dz-pt)",
                      paddingBottom: "var(--dz-pb)",
                      paddingLeft: "var(--dz-px)",
                      paddingRight: "var(--dz-px)",
                      boxShadow: dropzoneColors.shadowHover,
                    }
                  : {
                      borderWidth: 1.5,
                      borderStyle: "dashed",
                      borderColor: "var(--border-default)",
                      background: "var(--surface-1)",
                      paddingTop: "var(--dz-pt)",
                      paddingBottom: "var(--dz-pb)",
                      paddingLeft: "var(--dz-px)",
                      paddingRight: "var(--dz-px)",
                      boxShadow: dropzoneColors.shadowBase,
                    }),
            }}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            {/* 업로드 아이콘 + 안내 + 버튼 (모든 모드 공통 구조) */}
            <>
              <div className="flex flex-col items-center gap-3">
                <svg
                  style={{ width: "var(--dz-icon)", height: "var(--dz-icon)" }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <div className="text-center px-4">
                  <p
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: "var(--quick-text-body)",
                      fontWeight: 600,
                    }}
                  >
                    이미지를 드래그하거나 클릭하세요
                  </p>
                  <p
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "var(--quick-text-sub)",
                      letterSpacing: "0.1px",
                      marginTop: 4,
                    }}
                  >
                    {mode === "guest"
                      ? "JPG · PNG · WEBP · 최대 30장"
                      : "JPG · PNG · WEBP · 최대 20MB · 최대 30장"}
                  </p>
                  {mode === "guest" && (
                    <p
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 11,
                        marginTop: 2,
                        display: "var(--dz-hint-display)" as CSSProperties["display"],
                      }}
                    >
                      무료 가입 후 60장 · 장당 20MB
                    </p>
                  )}
                </div>
                {/* 파일 선택 버튼 — 아웃라인 버튼에 700은 과하므로 600 */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerPicker();
                  }}
                  className="transition-all hover:-translate-y-px"
                  style={{
                    background: "transparent",
                    border: "1.5px solid #E07A9A",
                    color: "#C25A7E",
                    fontWeight: 600,
                    fontSize: 13,
                    padding: "var(--dz-btn-py) var(--dz-btn-px)",
                    borderRadius: 999,
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = "rgba(224,122,154,0.06)";
                    el.style.borderColor = "#C25A7E";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = "transparent";
                    el.style.borderColor = "#E07A9A";
                  }}
                >
                  파일 선택
                </button>
              </div>

              {/* 구분선 */}
              <div
                className="w-4/5 border-t"
                style={{ borderColor: "var(--border-subtle)", display: "var(--dz-divider-display)" as CSSProperties["display"] }}
              />

              {/* 예시 갤러리 */}
              <ExampleGallery mode={mode === "guest" ? "guest" : "workspace"} />
            </>
          </div>
            );
          })()}
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
          {pageItems.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              isSelected={selectedIds.has(it.id)}
              isDetailActive={it.id === detailItemId}
              onToggleSelect={onToggleSelect}
              onRemove={onRemove}
              onUpdate={onUpdateItem}
              onClickDetail={onClickDetail}
            />
          ))}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={triggerPicker}
            className="border-t-2 border-dashed cursor-pointer text-xs flex items-center justify-center gap-2 py-3 transition-colors"
            style={{
              color: "var(--text-muted)",
              borderColor: isDragging
                ? "var(--accent)"
                : "var(--border-subtle)",
              background: isDragging
                ? "var(--accent-subtle)"
                : "transparent",
            }}
          >
            <span>+ 이미지 추가 (드래그도 가능)</span>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </section>
  );
}

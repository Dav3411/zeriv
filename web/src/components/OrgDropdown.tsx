"use client";

import { useEffect, useRef, useState } from "react";

export interface OrgDropdownProps {
  orgs: { id: string; name: string; brandCount?: number }[];
  selectedOrgId: string | null;
  onChange: (orgId: string) => void;
  placeholder?: string;
  className?: string;
}

// 빌딩 아이콘
function BuildingIcon({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

// 체크마크 아이콘
function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-pink-400 shrink-0"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ChevronDown 아이콘
function ChevronDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-zinc-500 shrink-0"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function OrgDropdown({
  orgs,
  selectedOrgId,
  onChange,
  placeholder = "Organization 선택",
  className = "",
}: OrgDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId) ?? null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all min-w-[200px]"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "var(--border-hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "var(--border-default)";
        }}
      >
        <BuildingIcon size={16} className="text-zinc-400 shrink-0" />
        <span className="flex-1 text-left truncate">
          {selectedOrg ? selectedOrg.name : placeholder}
        </span>
        <ChevronDownIcon />
      </button>

      {/* 드롭다운 */}
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-xl overflow-hidden max-h-48 overflow-y-auto min-w-[200px] w-full"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {orgs.length === 0 ? (
            <div className="px-3 py-3 text-xs text-zinc-500">
              Organization이 없습니다.
            </div>
          ) : (
            orgs.map((org) => {
              const isActive = org.id === selectedOrgId;
              return (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => {
                    onChange(org.id);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors text-left"
                  style={{
                    background: isActive ? "var(--surface-3)" : "transparent",
                    color: isActive
                      ? "var(--text-primary)"
                      : "var(--text-primary)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "var(--surface-2)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "transparent";
                  }}
                >
                  <BuildingIcon size={14} className="text-zinc-400 shrink-0" />
                  <span className="flex-1 truncate font-medium">
                    {org.name}
                  </span>
                  {typeof org.brandCount === "number" && (
                    <span className="text-[10px] text-zinc-500 shrink-0">
                      {org.brandCount} brands
                    </span>
                  )}
                  {isActive && <CheckIcon />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

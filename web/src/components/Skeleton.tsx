"use client";

export function Skeleton({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded-md bg-zinc-700/50 ${className}`}
      {...props}
    />
  );
}

/** 목록/카드 그리드용 스켈레톤 (아바타 + 텍스트 줄) */
export function ListItemSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
      <div className="flex-1 min-w-0 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-full" style={{ maxWidth: i === 0 ? "80%" : "60%" }} />
        ))}
      </div>
    </div>
  );
}

"use client";

export interface UsageMeterProps {
  label: string;
  current: number;
  limit: number | null;
  unit?: string;
}

export function UsageMeter({ label, current, limit, unit }: UsageMeterProps) {
  // limit === 0: 해당 플랜에서 미포함 — "0 / 0" 대신 "미포함" 표기
  const isExcluded = limit === 0;

  const pct =
    limit !== null && limit > 0
      ? Math.min(Math.round((current / limit) * 100), 100)
      : null;
  const isNearLimit = pct !== null && pct >= 80;

  const currentStr = current.toLocaleString();
  const limitStr = limit !== null ? limit.toLocaleString() : "무제한";

  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{ background: "var(--surface-2)" }}
    >
      <p className="text-[10px] text-zinc-500">{label}</p>
      {isExcluded ? (
        <p className="text-sm font-semibold text-zinc-500">미포함</p>
      ) : (
        <p
          className={`text-sm font-semibold ${isNearLimit ? "text-red-400" : "text-white"}`}
        >
          {currentStr}
          {unit && (
            <span className="text-xs font-normal text-zinc-400">{unit}</span>
          )}
          <span className="text-xs font-normal text-zinc-500">
            {" "}
            / {limitStr}
            {limit !== null && unit && (
              <span className="text-xs font-normal text-zinc-400">{unit}</span>
            )}
          </span>
        </p>
      )}
      {!isExcluded && (
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: "var(--surface-3)" }}
        >
          {pct !== null && (
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: isNearLimit
                  ? "#f87171"
                  : "linear-gradient(90deg, #ffa4c6, #ffe3be)",
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

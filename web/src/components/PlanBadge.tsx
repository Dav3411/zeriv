"use client";

export interface PlanBadgeProps {
  planKey:
    | "free"
    | "quick_plus"
    | "starter"
    | "label"
    | "pro"
    | "studio"
    | string
    | null;
  planTier?: number;
  size?: "sm" | "md";
}

const PLAN_CFG: Record<string, { label: string; bg: string; color: string }> = {
  free: {
    label: "Free",
    bg: "rgba(161,161,170,0.12)",
    color: "#a1a1aa",
  },
  quick_plus: {
    label: "Quick Plus",
    // Free와 Atelier 사이의 톤 — Atelier 핑크보다 한 단계 옅게
    bg: "rgba(244,114,198,0.08)",
    color: "#f9a8d4",
  },
  starter: {
    label: "Atelier",
    bg: "rgba(244,114,198,0.15)",
    color: "#f472b6",
  },
  label: {
    label: "Label",
    bg: "rgba(167,139,250,0.15)",
    color: "#a78bfa",
  },
  pro: {
    label: "Pro",
    bg: "rgba(56,189,248,0.15)",
    color: "#38bdf8",
  },
  studio: {
    label: "House",
    bg: "rgba(251,191,36,0.15)",
    color: "#fbbf24",
  },
};

export function PlanBadge({ planKey, planTier, size = "sm" }: PlanBadgeProps) {
  const key = planKey ?? "free";
  const cfg = PLAN_CFG[key] ?? PLAN_CFG.free;

  let label = cfg.label;
  if (key === "pro" && planTier != null) {
    label = `Pro Tier ${planTier}`;
  }

  const px = size === "md" ? "px-2.5 py-1" : "px-2 py-0.5";
  const text = size === "md" ? "text-xs" : "text-[10px]";

  return (
    <span
      className={`inline-flex items-center ${px} rounded-md ${text} font-semibold`}
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {label}
    </span>
  );
}

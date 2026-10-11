/**
 * BlogTagChip — 태그 pill 컴포넌트.
 * - href 있으면 Link, 없으면 button.
 * - selected=true면 핑크-오렌지 gradient 배경, 아니면 outlined.
 */

import Link from "next/link";

interface Props {
  tag: string;
  selected?: boolean;
  href?: string;
  onClick?: () => void;
}

export function BlogTagChip({ tag, selected = false, href, onClick }: Props) {
  const baseClass =
    "inline-flex items-center text-[11px] font-medium px-3 py-1 rounded-full transition-all whitespace-nowrap shrink-0";

  // selected: gradient — hover 효과 불필요 (이미 강조 상태)
  // default: outlined — hover 시 핑크 틴트 배경 (Tailwind hover: 클래스 사용 — inline style hover 불가)
  const selectedClass =
    "text-white border border-transparent bg-gradient-to-br from-[#ec4899] to-[#f97316]";
  const defaultClass =
    "bg-transparent text-[#d946a8] border border-[rgba(236,72,153,0.3)] hover:bg-[rgba(236,72,153,0.08)] hover:border-[rgba(236,72,153,0.5)]";

  const className = `${baseClass} ${selected ? selectedClass : defaultClass}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {tag}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {tag}
    </button>
  );
}

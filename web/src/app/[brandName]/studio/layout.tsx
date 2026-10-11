import type { ReactNode } from "react";

export default function StudioLayout({ children }: { children: ReactNode }) {
  // flex 체인을 잇는다 — 부모 <main> 이 flex flex-col 이므로 본 컨테이너도 flex-1+min-h-0
  // 으로 잔여 높이를 차지해야 page.tsx 의 overflow-y-auto 가 작동한다.
  // py-10 / px-6 sm:px-10 패딩은 page.tsx 가 -mt-10 -mb-10 음수 마진으로 상쇄하므로
  // 다른 페이지 호환성 위해 유지 (장기적으로는 page.tsx 의 음수 마진 패턴을 정리).
  return (
    <div className="flex flex-col flex-1 min-h-0 w-full px-6 sm:px-10 py-10">
      {children}
    </div>
  );
}

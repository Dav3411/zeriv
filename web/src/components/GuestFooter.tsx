"use client";

/**
 * GuestFooter — 비로그인 게스트 페이지(`/guest/quick`, `/guest/studio`) 전용
 * 경량 푸터. 랜딩 FooterSection 의 풀 푸터(법무·사업자 정보 포함)와 달리
 * 도구 페이지에 맞춰 핵심 링크 + 카피라이트만 노출한다.
 *
 * 디자인: data-theme="guest-light" 컨텍스트에 들어가 있어 CSS 토큰이 자동으로
 * 라이트 값을 받는다. 인라인 색은 토큰만 사용 — 다크 fallback 도 안전.
 */

import Link from "next/link";

export function GuestFooter() {
  return (
    <footer
      className="px-7 py-8 mt-auto shrink-0"
      style={{
        borderTop: "1px solid var(--border-subtle)",
        background: "transparent",
      }}
    >
      <div className="mx-auto max-w-[1400px] flex flex-col gap-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            © 2026 Zeriv. All rights reserved.
          </span>
          <nav
            className="flex items-center gap-5 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <Link
              href="/pricing"
              className="transition-colors hover:text-[color:var(--text-primary)]"
            >
              요금제
            </Link>
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
          </nav>
        </div>
        <p
          className="text-[11px] leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="block sm:inline">
            상호: 예시 사업자 &nbsp;|&nbsp; 대표자: 예시 대표자 &nbsp;|&nbsp; 사업자등록번호: 000-00-00000 &nbsp;|&nbsp; 통신판매업 신고번호: 예시 신고번호 &nbsp;|&nbsp;{" "}
            <a
              href="https://www.ftc.go.kr/bizCommPop.do?wrkr_no=0000000000"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[color:var(--text-primary)]"
              style={{ color: "var(--text-muted)", textDecoration: "underline", textUnderlineOffset: "2px" }}
            >
              사업자정보확인
            </a>
          </span>
          <span className="block sm:inline">
            <span className="hidden sm:inline">&nbsp;|&nbsp;</span>
            사업장소재지: 예시 사업장 주소 &nbsp;|&nbsp; 이메일: support@example.com &nbsp;|&nbsp; 전화: 000-0000-0000
          </span>
        </p>
      </div>
    </footer>
  );
}

"use client";

/**
 * BlogShareBar — 소셜 공유 버튼 행 (데스크탑·모바일 동일 inline 표시).
 *
 * 모바일 sticky bar는 다음 PR로 보류 (ui-ux-designer 권장 대비 차이).
 *
 * 환경변수: NEXT_PUBLIC_KAKAO_APP_KEY
 *   - Kakao Developers > 내 애플리케이션 > 앱 키 > JavaScript 키
 *   - Vercel 환경변수에 등록 필요
 *
 * 카카오 SDK integrity 해시:
 *   - 카카오 공식 다운로드 페이지(https://developers.kakao.com/docs/ko/javascript/download)에서
 *     integrity 값이 문서화되어 있지 않아 생략함.
 *     보안 강화가 필요한 경우 직접 SDK 파일을 다운로드해 sha384 해시를 계산 후 추가 권장.
 */

import { useState } from "react";
import Script from "next/script";

interface Props {
  url: string;
  title: string;
}

// --- 아이콘 SVG ---

function KakaoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 3C6.477 3 2 6.477 2 10.95c0 2.836 1.727 5.33 4.327 6.822L5.18 21.5l5.4-3.546C10.843 18.07 11.42 18.1 12 18.1c5.523 0 10-3.477 10-7.95C22 6.477 17.523 3 12 3z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function RssIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  );
}

// --- 버튼 공통 스타일 ---

const btnBase =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all hover:opacity-80 active:scale-95";

const kakaoStyle: React.CSSProperties = {
  background: "#FEE500",
  borderColor: "transparent",
  color: "#191919",
};

const xStyle: React.CSSProperties = {
  background: "#000",
  borderColor: "transparent",
  color: "#fff",
};

const fbStyle: React.CSSProperties = {
  background: "#1877F2",
  borderColor: "transparent",
  color: "#fff",
};

const copyStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.04)",
  borderColor: "rgba(0,0,0,0.1)",
  color: "#52525b",
};

const rssStyle: React.CSSProperties = {
  background: "rgba(249,115,22,0.08)",
  borderColor: "rgba(249,115,22,0.2)",
  color: "#ea580c",
};

export function BlogShareBar({ url, title }: Props) {
  const [copied, setCopied] = useState(false);

  const handleKakao = () => {
    if (typeof window === "undefined") return;
    const key = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
    if (!key) return; // 환경변수 미설정 시 silent (다른 공유 버튼은 정상)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Kakao = (window as any).Kakao;
    if (!Kakao) return;
    if (!Kakao.isInitialized()) {
      Kakao.init(key);
    }
    Kakao.Share?.sendDefault({
      objectType: "feed",
      content: {
        title,
        description: "",
        imageUrl: "",
        link: { mobileWebUrl: url, webUrl: url },
      },
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API 미지원 폴백
      const el = document.createElement("input");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const twitterHref = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  return (
    <>
      <div className="mt-10 mb-6">
        <h4 className="text-xs font-semibold text-zinc-500 mb-3">공유하기</h4>
        <div className="flex flex-wrap gap-2">
          {/* 카카오톡 */}
          <button
            type="button"
            onClick={handleKakao}
            className={btnBase}
            style={kakaoStyle}
          >
            <KakaoIcon /> 카카오톡
          </button>

          {/* X (Twitter) */}
          <a
            href={twitterHref}
            target="_blank"
            rel="noopener noreferrer"
            className={btnBase}
            style={xStyle}
          >
            <XIcon /> X
          </a>

          {/* 페이스북 */}
          <a
            href={facebookHref}
            target="_blank"
            rel="noopener noreferrer"
            className={btnBase}
            style={fbStyle}
          >
            <FacebookIcon /> 페이스북
          </a>

          {/* 링크 복사 */}
          <button
            type="button"
            onClick={handleCopy}
            className={btnBase}
            style={copyStyle}
          >
            <CopyIcon /> {copied ? "복사됨 ✓" : "링크 복사"}
          </button>

          {/* RSS 버튼은 /blog 인덱스 헤더에 이미 노출되므로 글 상세에선 제거 */}
        </div>
      </div>

      {/* 카카오 SDK — integrity 해시 미공개로 생략 (카카오 공식 문서 참고) */}
      <Script
        src="https://t1.kakaocdn.net/kakao_js_sdk/2.8.1/kakao.min.js"
        strategy="lazyOnload"
        crossOrigin="anonymous"
      />
    </>
  );
}

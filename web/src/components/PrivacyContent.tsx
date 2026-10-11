"use client";

import { useState, type ReactNode } from "react";

/* ─── Section type ─── */
type Section = {
  id?: string;
  heading: string;
  body: ReactNode;
};

/* ─── English ─── */
const PRIVACY_EN: Section[] = [
  {
    heading: "1. Information We Collect",
    body: (
      <>
        <p>We collect the following types of information:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>
            <strong className="text-zinc-100">Account information:</strong>{" "}
            email address, nickname, and password (hashed)
          </li>
          <li>
            <strong className="text-zinc-100">Usage data:</strong> brands
            created, personas configured, images and videos generated,
            engagement metrics
          </li>
          <li>
            <strong className="text-zinc-100">Device information:</strong>{" "}
            browser type, IP address, and general location
          </li>
          <li>
            <strong className="text-zinc-100">Payment information:</strong>{" "}
            processed securely through third-party payment providers
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "2. How We Use Your Information",
    body: (
      <>
        <p>We use your information to:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Provide and improve the Service</li>
          <li>Process transactions and manage your account</li>
          <li>Communicate important updates about the Service</li>
          <li>Detect and prevent fraud or abuse</li>
        </ul>
      </>
    ),
  },
  {
    heading: "3. Data Sharing",
    body: (
      <>
        <p>We do not sell your personal information. We may share data with:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>
            Service providers who help operate the platform (hosting, analytics,
            payments)
          </li>
          <li>Law enforcement when required by law</li>
          <li>
            Team workspace members within your organization, limited to shared
            brand assets and generated content
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "4. Data Storage & Security",
    body: (
      <p>
        Your data is stored securely using industry-standard encryption. We use
        Supabase for authentication and database services with row-level
        security policies. While we take reasonable measures to protect your
        data, no system is completely secure.
      </p>
    ),
  },
  {
    heading: "5. Cookies",
    body: (
      <p>
        We use only essential cookies required for authentication and language
        preference. No analytics or advertising cookies are used. You can
        control cookie settings through your browser at any time.
      </p>
    ),
  },
  {
    heading: "6. Your Rights",
    body: (
      <>
        <p>You have the right to:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Access and download your personal data</li>
          <li>Correct inaccurate information</li>
          <li>Request deletion of your account and associated data</li>
          <li>Opt out of non-essential communications</li>
        </ul>
      </>
    ),
  },
  {
    heading: "7. Data Retention",
    body: (
      <p>
        We retain your data for as long as your account is active. Upon account
        deletion, we will remove your personal data within 30 days, except where
        retention is required by law or for legitimate business purposes.
      </p>
    ),
  },
  {
    heading: "8. Children's Privacy",
    body: (
      <p>
        The Service is not intended for users under 13 years of age. We do not
        knowingly collect personal information from children under 13.
      </p>
    ),
  },
  {
    heading: "9. Changes to This Policy",
    body: (
      <p>
        We may update this Privacy Policy from time to time. We will notify
        users of significant changes via email or in-app notification.
      </p>
    ),
  },
  {
    heading: "10. Contact",
    body: (
      <p>
        For privacy-related inquiries, please contact us at support@example.com.
      </p>
    ),
  },
];

/* ─── Korean ─── */
const PRIVACY_KO: Section[] = [
  {
    heading: "1. 수집하는 정보",
    body: (
      <>
        <p>다음 유형의 정보를 수집합니다:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>
            <strong className="text-zinc-100">계정 정보:</strong> 이메일 주소,
            닉네임, 비밀번호(해시 처리)
          </li>
          <li>
            <strong className="text-zinc-100">이용 데이터:</strong> 생성한
            브랜드 콘텐츠, 설정한 페르소나, 생성된 이미지·영상, 참여 지표
          </li>
          <li>
            <strong className="text-zinc-100">기기 정보:</strong> 브라우저 유형,
            IP 주소, 대략적인 위치
          </li>
          <li>
            <strong className="text-zinc-100">결제 정보:</strong> 제3자 결제
            서비스 제공업체를 통해 안전하게 처리
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "2. 정보 이용 목적",
    body: (
      <>
        <p>수집된 정보는 다음 목적으로 이용됩니다:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>서비스 제공 및 개선</li>
          <li>거래 처리 및 계정 관리</li>
          <li>서비스 관련 중요 업데이트 안내</li>
          <li>사기 및 악용 방지</li>
        </ul>
      </>
    ),
  },
  {
    heading: "3. 데이터 공유",
    body: (
      <>
        <p>
          당사는 개인정보를 판매하지 않습니다. 다음 경우에 데이터를 공유할 수
          있습니다:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>플랫폼 운영을 지원하는 서비스 제공업체(호스팅, 분석, 결제)</li>
          <li>법적 요구가 있는 경우 법 집행 기관</li>
          <li>
            팀 워크스페이스 내 조직 구성원에 한해 공유 브랜드 자산 및 생성
            콘텐츠
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "4. 데이터 저장 및 보안",
    body: (
      <p>
        데이터는 업계 표준 암호화를 사용하여 안전하게 저장됩니다. 인증 및
        데이터베이스 서비스에는 행 수준 보안 정책이 적용된 Supabase를
        사용합니다. 데이터 보호를 위해 합리적인 조치를 취하고 있으나, 어떠한
        시스템도 완벽하게 안전하지는 않습니다.
      </p>
    ),
  },
  {
    heading: "5. 쿠키",
    body: (
      <p>
        당사는 인증 및 언어 설정 저장에 필요한 필수 쿠키만 사용합니다. 분석 또는
        광고 쿠키는 사용하지 않습니다. 브라우저 설정을 통해 언제든지 쿠키를
        관리할 수 있습니다.
      </p>
    ),
  },
  {
    heading: "6. 사용자 권리",
    body: (
      <>
        <p>사용자는 다음 권리를 갖습니다:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>개인 데이터에 접근하고 다운로드할 권리</li>
          <li>부정확한 정보를 정정할 권리</li>
          <li>계정 및 관련 데이터의 삭제를 요청할 권리</li>
          <li>비필수 커뮤니케이션 수신을 거부할 권리</li>
        </ul>
      </>
    ),
  },
  {
    heading: "7. 데이터 보관",
    body: (
      <p>
        계정이 활성 상태인 동안 데이터를 보관합니다. 계정 삭제 시 30일 이내에
        개인 데이터를 삭제하며, 법적 요구 또는 정당한 사업 목적으로 보관이
        필요한 경우는 예외입니다.
      </p>
    ),
  },
  {
    heading: "8. 아동 개인정보",
    body: (
      <p>
        본 서비스는 만 13세 미만의 사용자를 대상으로 하지 않습니다. 만 13세 미만
        아동의 개인정보를 고의로 수집하지 않습니다.
      </p>
    ),
  },
  {
    heading: "9. 정책 변경",
    body: (
      <p>
        본 개인정보처리방침은 수시로 변경될 수 있습니다. 중요한 변경 사항은
        이메일 또는 앱 내 알림을 통해 안내합니다.
      </p>
    ),
  },
  {
    heading: "10. 문의",
    body: <p>개인정보 관련 문의는 support@example.com로 연락해 주세요.</p>,
  },
];

const CONTENT = {
  en: {
    titlePrefix: "Privacy ",
    titleHighlight: "Policy",
    date: "Last updated: April 17, 2026",
    sections: PRIVACY_EN,
  },
  ko: {
    titlePrefix: "",
    titleHighlight: "개인정보처리방침",
    date: "최종 수정: 2026년 4월 17일",
    sections: PRIVACY_KO,
  },
} as const;

/* ─── Component ─── */
type Props = {
  initialLocale: "en" | "ko";
  showLanguageToggle: boolean;
};

export function PrivacyContent({ initialLocale, showLanguageToggle }: Props) {
  const [lang, setLang] = useState<"en" | "ko">(initialLocale);
  const { titlePrefix, titleHighlight, date, sections } = CONTENT[lang];

  return (
    <>
      {showLanguageToggle && (
        <div className="flex gap-1 mb-6">
          {(["en", "ko"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                lang === l
                  ? "text-black"
                  : "text-zinc-400 hover:text-zinc-200 bg-white/5"
              }`}
              style={lang === l ? { background: "var(--brand-gradient)" } : {}}
            >
              {l === "en" ? "English" : "한국어"}
            </button>
          ))}
        </div>
      )}

      <div className="mb-6">
        <h1 className="font-headline text-3xl font-bold tracking-tight mb-1 text-white">
          {titlePrefix}
          {titleHighlight}
        </h1>
        <p className="text-xs text-zinc-400">{date}</p>
      </div>

      <div className="space-y-6">
        {sections.map((section, i) => (
          <div key={i} id={section.id}>
            <h2 className="text-sm font-semibold text-white mb-2">
              {section.heading}
            </h2>
            <div className="text-sm leading-relaxed text-zinc-300">
              {section.body}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
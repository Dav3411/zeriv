"use client";

import { useState, type ReactNode } from "react";

/* ─── Section type ─── */
type Section = {
  id?: string;
  heading: string;
  body: ReactNode;
};

/* ─── English ─── */
const TERMS_EN: Section[] = [
  {
    heading: "1. Acceptance of Terms",
    body: (
      <p>
        By accessing or using Zeriv (&quot;the Service&quot;), you agree to be
        bound by these Terms of Service. If you do not agree, you may not use
        the Service.
      </p>
    ),
  },
  {
    heading: "2. Description of Service",
    body: (
      <p>
        Zeriv is an AI-powered brand marketing visual automation platform. Define
        your brand&apos;s visual identity, train AI personas (virtual models), and
        automatically generate consistent on-brand product shots, lifestyle images,
        and ad sequences at scale &mdash; enabling teams to produce marketing visuals
        faster and more affordably than traditional methods. The Service includes
        brand style management, AI persona training, content generation tools, team
        workspace, and subscription-based plan management.
      </p>
    ),
  },
  {
    heading: "3. User Accounts",
    body: (
      <p>
        You must provide accurate information when creating an account. You are
        responsible for maintaining the security of your account credentials.
        You must be at least 13 years old to use the Service.
      </p>
    ),
  },
  {
    heading: "4. Content & Intellectual Property",
    body: (
      <p>
        Content generated through Zeriv is subject to our content policies. You
        retain rights to your original creative inputs (prompts, persona
        configurations). Zeriv retains a license to host, display, and
        distribute generated content on the platform.
      </p>
    ),
  },
  {
    heading: "5. Credits & Payments",
    body: (
      <>
        <p className="mb-3">
          Zeriv offers subscription plans billed monthly in Korean Won (KRW). Subscriptions
          automatically renew each month unless cancelled before the renewal date. By
          subscribing, you authorize Zeriv to charge your payment method on a recurring basis.
        </p>
        <p className="mb-3">
          <strong className="text-zinc-100">Cancellation policy.</strong> You may cancel your
          subscription at any time through Workspace Settings &rarr; Subscription Management. Your
          plan remains active until the end of the current billing period. No prorated refunds
          are issued for partial months.
        </p>
        <p className="mb-3">
          <strong className="text-zinc-100">Refunds.</strong> Subscription fees are
          non-refundable except where required by applicable law. If you believe a charge was
          made in error, contact support@example.com within 7 days of the charge.
        </p>
        <p>
          <strong className="text-zinc-100">Pricing changes.</strong> Zeriv reserves the right
          to modify subscription pricing. You will be notified at least 30 days before any
          price change takes effect.
        </p>
      </>
    ),
  },
  {
    id: "subscription-plans",
    heading: "6. Subscription Plans & Usage Limits",
    body: (
      <>
        <p className="mb-3">
          Each subscription plan includes defined usage limits for styles, image generations,
          brands, and team members. Limits reset at the start of each billing cycle.
        </p>
        <ul className="list-disc pl-5 mb-3 space-y-2">
          <li><strong className="text-zinc-100">Free</strong> &mdash; 5 generations/month, 1 brand, 1 member (no styles, no AI models)</li>
          <li><strong className="text-zinc-100">Quick Plus</strong> (KRW 9,900/month) &mdash; 1 style, 50 generations/month, 1 brand, 1 member, 3 channel exports</li>
          <li><strong className="text-zinc-100">Atelier</strong> (KRW 29,000/month) &mdash; 5 styles, 2 AI models, 200 generations/month, 4 brands, 3 members, 3 channel exports</li>
        </ul>
        <p>
          Plan details and pricing are subject to change. The most current plan information is
          always available at zeriv.io/pricing. Exceeding plan limits will temporarily restrict
          the affected feature until the next billing cycle.
        </p>
      </>
    ),
  },
  {
    heading: "7. Prohibited Content",
    body: (
      <>
        <p className="mb-3">
          Zeriv employs automated content safety systems to detect and block the
          following categories of prohibited content. Users may not create,
          submit, or distribute content that falls under any of these
          categories:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <strong className="text-zinc-100">
              Real person impersonation.
            </strong>{" "}
            Content that claims to represent, quote, or speak as a real
            identifiable person, including fabricated confessions, interviews,
            or leaked recordings attributed to real individuals.
          </li>
          <li>
            <strong className="text-zinc-100">Personal information.</strong>{" "}
            Content containing personal data such as phone numbers, email
            addresses, home addresses, national identification numbers, or any
            other personally identifiable information.
          </li>
          <li>
            <strong className="text-zinc-100">Sexual content.</strong> Content
            containing explicit sexual acts, graphic sexual descriptions, or
            sexually exploitative material.
          </li>
          <li>
            <strong className="text-zinc-100">Harmful content.</strong> Content
            that promotes, instructs, or glorifies crimes, violence, self-harm,
            suicide, or dangerous illegal activities.
          </li>
          <li>
            <strong className="text-zinc-100">Copyrighted characters.</strong>{" "}
            Content that reproduces a specific copyrighted character (from
            anime, games, movies, or other media) speaking or acting as
            themselves without authorization.
          </li>
        </ul>
        <p className="mt-3">
          Content flagged by our safety systems will be automatically rejected.
          Repeated violations may result in account suspension or termination.
        </p>
      </>
    ),
  },
  {
    heading: "8. Prohibited Conduct",
    body: (
      <>
        <p>You may not:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Use the Service for illegal purposes</li>
          <li>Create multiple accounts to circumvent platform rules</li>
          <li>Reverse-engineer or scrape the Service</li>
          <li>Harass other users or impersonate others</li>
          <li>Attempt to bypass or circumvent content safety systems</li>
        </ul>
      </>
    ),
  },
  {
    heading: "9. Termination",
    body: (
      <p>
        Zeriv may suspend or terminate your account at any time for violation of
        these terms. Upon termination, access to the Service will cease immediately.
        Any unused portion of the current subscription period is non-refundable unless
        otherwise required by law.
      </p>
    ),
  },
  {
    heading: "10. Limitation of Liability",
    body: (
      <p>
        The Service is provided &quot;as is&quot; without warranties of any
        kind. Zeriv is not liable for any indirect, incidental, or consequential
        damages arising from your use of the Service.
      </p>
    ),
  },
  {
    heading: "11. Changes to Terms",
    body: (
      <p>
        We may update these terms at any time. Continued use of the Service
        after changes constitutes acceptance of the updated terms.
      </p>
    ),
  },
  {
    heading: "12. Contact",
    body: (
      <p>
        For questions about these terms, please contact us at support@example.com.
      </p>
    ),
  },
];

/* ─── Korean ─── */
const TERMS_KO: Section[] = [
  {
    heading: "1. 약관 동의",
    body: (
      <p>
        Zeriv(이하 &apos;서비스&apos;)에 접근하거나 이용함으로써 본 이용약관에
        동의하게 됩니다. 동의하지 않는 경우 서비스를 이용할 수 없습니다.
      </p>
    ),
  },
  {
    heading: "2. 서비스 설명",
    body: (
      <p>
        Zeriv는 AI 기반 브랜드 마케팅 비주얼 자동화 솔루션입니다. 브랜드의
        비주얼 아이덴티티를 설정하고, AI 페르소나(가상 모델)를 학습시켜 제품
        착용샷·라이프스타일 이미지·광고 시퀀스를 자동으로 대량 생성할 수
        있습니다. 기존 촬영 대비 빠르고 합리적인 비용으로 마케팅 비주얼을 제작할
        수 있으며, 서비스에는 브랜드 스타일 관리, AI 페르소나 학습, 이미지 생성
        도구, 팀 워크스페이스, 구독 플랜 관리가 포함됩니다.
      </p>
    ),
  },
  {
    heading: "3. 계정",
    body: (
      <p>
        계정 생성 시 정확한 정보를 제공해야 합니다. 계정 자격증명의 보안 유지는
        본인 책임입니다. 서비스 이용을 위해서는 만 13세 이상이어야 합니다.
      </p>
    ),
  },
  {
    heading: "4. 콘텐츠 및 지적재산권",
    body: (
      <p>
        Zeriv를 통해 생성된 콘텐츠는 콘텐츠 정책의 적용을 받습니다. 사용자는
        원본 창작 입력물(프롬프트, 페르소나 설정)에 대한 권리를 보유합니다.
        Zeriv는 플랫폼에서 생성된 콘텐츠를 호스팅, 표시, 배포할 수 있는
        라이선스를 갖습니다.
      </p>
    ),
  },
  {
    heading: "5. 크레딧 및 결제",
    body: (
      <>
        <p className="mb-3">
          Zeriv는 원화(KRW)로 월 단위 청구되는 구독 플랜을 제공합니다. 구독은 취소하지 않는
          한 매월 자동으로 갱신됩니다. 구독 신청 시 Zeriv가 정기적으로 결제 수단에 청구하는
          것에 동의하는 것으로 간주됩니다.
        </p>
        <p className="mb-3">
          <strong className="text-zinc-100">취소 정책.</strong> 워크스페이스 설정 &gt; 구독 관리에서
          언제든지 구독을 취소할 수 있습니다. 취소 후에도 현재 결제 주기가 끝날 때까지 플랜이
          유지됩니다. 잔여 기간에 대한 일할 환불은 제공되지 않습니다.
        </p>
        <p className="mb-3">
          <strong className="text-zinc-100">환불.</strong> 구독 요금은 관련 법령에서 요구하는
          경우를 제외하고 환불되지 않습니다. 청구 오류가 발생한 경우 청구일로부터 7일 이내에
          support@example.com로 문의해 주세요.
        </p>
        <p>
          <strong className="text-zinc-100">가격 변경.</strong> Zeriv는 구독 가격을 변경할 권리를
          보유합니다. 가격 변경 전 최소 30일 전에 사전 고지합니다.
        </p>
      </>
    ),
  },
  {
    id: "subscription-plans",
    heading: "6. 구독 플랜 및 이용 제한",
    body: (
      <>
        <p className="mb-3">
          각 구독 플랜은 스타일 수, 이미지 생성 횟수, 브랜드 수, 팀원 수에 대한 이용 한도를
          포함합니다. 이용 한도는 매 결제 주기 시작 시 초기화됩니다.
        </p>
        <ul className="list-disc pl-5 mb-3 space-y-2">
          <li><strong className="text-zinc-100">Free</strong> &mdash; 이미지 생성 5장/월, 브랜드 1개, 팀원 1명 (스타일·AI 모델 미포함)</li>
          <li><strong className="text-zinc-100">Quick Plus</strong> (월 9,900원) &mdash; 스타일 1개, 이미지 생성 50장/월, 브랜드 1개, 팀원 1명, 채널 내보내기 3채널</li>
          <li><strong className="text-zinc-100">Atelier</strong> (월 29,000원) &mdash; 스타일 5개, AI 모델 2명, 이미지 생성 200장/월, 브랜드 4개, 팀원 3명, 채널 내보내기 3채널</li>
        </ul>
        <p>
          플랜 세부 내용과 가격은 변경될 수 있습니다. 최신 플랜 정보는 zeriv.io/pricing에서
          항상 확인할 수 있습니다. 이용 한도 초과 시 다음 결제 주기까지 해당 기능이 일시적으로
          제한될 수 있습니다.
        </p>
      </>
    ),
  },
  {
    heading: "7. 금지 콘텐츠",
    body: (
      <>
        <p className="mb-3">
          Zeriv는 자동화된 콘텐츠 안전 시스템을 사용하여 다음 범주의 금지
          콘텐츠를 감지하고 차단합니다. 사용자는 다음 범주에 해당하는 콘텐츠를
          생성, 제출 또는 배포할 수 없습니다:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <strong className="text-zinc-100">실제 인물 모방.</strong> 실제 식별
            가능한 인물을 대변하거나 그들의 말을 인용하는 콘텐츠, 실제 인물에
            귀속된 허위 고백, 인터뷰, 유출 녹음 포함.
          </li>
          <li>
            <strong className="text-zinc-100">개인 정보.</strong> 전화번호,
            이메일 주소, 자택 주소, 주민등록번호 등 개인 식별 정보가 포함된
            콘텐츠.
          </li>
          <li>
            <strong className="text-zinc-100">성적 콘텐츠.</strong> 노골적인
            성행위, 생생한 성적 묘사, 성착취 소재가 포함된 콘텐츠.
          </li>
          <li>
            <strong className="text-zinc-100">유해 콘텐츠.</strong> 범죄, 폭력,
            자해, 자살, 위험한 불법 행위를 조장, 지시, 미화하는 콘텐츠.
          </li>
          <li>
            <strong className="text-zinc-100">저작권 캐릭터.</strong> 허가 없이
            특정 저작권 캐릭터(애니메이션, 게임, 영화 등)가 본인으로서 발화,
            행동하는 콘텐츠.
          </li>
        </ul>
        <p className="mt-3">
          안전 시스템에 의해 감지된 콘텐츠는 자동으로 거부됩니다. 반복 위반 시
          계정이 정지 또는 해지될 수 있습니다.
        </p>
      </>
    ),
  },
  {
    heading: "8. 금지 행위",
    body: (
      <>
        <p>다음 행위는 금지됩니다:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>불법적인 목적으로 서비스를 이용하는 행위</li>
          <li>플랫폼 규칙을 우회하기 위해 다수의 계정을 생성하는 행위</li>
          <li>서비스를 역설계하거나 스크래핑하는 행위</li>
          <li>다른 사용자를 괴롭히거나 타인을 사칭하는 행위</li>
          <li>콘텐츠 안전 시스템을 우회하거나 회피하려는 행위</li>
        </ul>
      </>
    ),
  },
  {
    heading: "9. 계정 해지",
    body: (
      <p>
        Zeriv는 본 약관 위반 시 언제든지 계정을 정지하거나 해지할 수 있습니다.
        계정 해지 시 즉시 서비스 접근이 종료됩니다. 현재 구독 기간의 미사용
        잔여 기간에 대한 환불은 법령에서 달리 정하는 경우를 제외하고 제공되지
        않습니다.
      </p>
    ),
  },
  {
    heading: "10. 책임 제한",
    body: (
      <p>
        서비스는 어떠한 종류의 보증 없이 &quot;있는 그대로&quot; 제공됩니다.
        Zeriv는 서비스 이용으로 인해 발생하는 간접적, 우발적 또는 결과적 손해에
        대해 책임을 지지 않습니다.
      </p>
    ),
  },
  {
    heading: "11. 약관 변경",
    body: (
      <p>
        본 약관은 언제든지 변경될 수 있습니다. 변경 후 서비스를 계속 이용하면
        변경된 약관에 동의한 것으로 간주됩니다.
      </p>
    ),
  },
  {
    heading: "12. 문의",
    body: <p>약관에 관한 문의는 support@example.com로 연락해 주세요.</p>,
  },
];

const CONTENT = {
  en: {
    titlePrefix: "Terms of ",
    titleHighlight: "Service",
    date: "Last updated: April 17, 2026",
    sections: TERMS_EN,
  },
  ko: {
    titlePrefix: "",
    titleHighlight: "이용약관",
    date: "최종 수정: 2026년 4월 17일",
    sections: TERMS_KO,
  },
} as const;

/* ─── Component ─── */
type Props = {
  initialLocale: "en" | "ko";
  showLanguageToggle: boolean;
};

export function TermsContent({ initialLocale, showLanguageToggle }: Props) {
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
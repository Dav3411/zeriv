'use client';

import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export type PlanActionMode = 'subscribe' | 'upgrade' | 'downgrade' | 'current';

type Props = {
  planKey: 'quick_plus' | 'starter' | 'label' | 'pro';
  brandId: string;
  /** Pro 플랜 전용 티어 (1~4). 다른 플랜에서는 무시됨. */
  planTier?: number;
  label?: string;
  className?: string;
  /** 인라인 style — 다운그레이드 등 className 만으로 표현하기 어려운 외형에 사용. */
  buttonStyle?: CSSProperties;
  /** 기본 'subscribe'. upgrade/downgrade 는 외부 다이얼로그 트리거용. */
  mode?: PlanActionMode;
  onUpgrade?: () => void;
  onDowngrade?: () => void;
};

/**
 * KRW 정기결제 시작 버튼.
 *
 * mode 동작:
 *   - 'subscribe' : /checkout/galaxia 로 라우팅 (기존 동작)
 *   - 'upgrade'   : onUpgrade() 콜백 — 외부 UpgradeConfirmDialog 오픈
 *   - 'downgrade' : onDowngrade() 콜백 — 외부 DowngradeConfirmDialog 오픈
 *   - 'current'   : 비활성 div 렌더 (클릭 무효)
 *
 * className 만으로 색/테두리를 표현하기 어려운 경우 buttonStyle 로 인라인 style 을 전달한다.
 * (ex: 다운그레이드 버튼의 중립 톤 색상 — Tailwind 임의값 클래스보다 안정적)
 */
export function PortonePayButton({
  planKey,
  brandId,
  planTier,
  label,
  className,
  buttonStyle,
  mode = 'subscribe',
  onUpgrade,
  onDowngrade,
}: Props) {
  const router = useRouter();
  const { user } = useAuth();

  if (mode === 'current') {
    return (
      <div className="w-full">
        <div
          className={className}
          style={{
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.25)',
            cursor: 'not-allowed',
            pointerEvents: 'none',
            textAlign: 'center',
            ...buttonStyle,
          }}
          aria-disabled="true"
        >
          현재 이용 중
        </div>
      </div>
    );
  }

  function handleClick() {
    if (mode === 'upgrade') {
      onUpgrade?.();
      return;
    }
    if (mode === 'downgrade') {
      onDowngrade?.();
      return;
    }
    if (!user) {
      router.push('/login?redirect=/pricing');
      return;
    }
    const tier = planKey === 'pro' && planTier ? planTier : 1;
    router.push(`/checkout/galaxia?plan=${planKey}&brand_id=${brandId}&tier=${tier}`);
  }

  return (
    <div className="w-full">
      <button onClick={handleClick} className={className} style={buttonStyle}>
        {label ??
          (mode === 'upgrade'
            ? '업그레이드'
            : mode === 'downgrade'
              ? '다운그레이드'
              : '정기결제 시작하기')}
      </button>
    </div>
  );
}

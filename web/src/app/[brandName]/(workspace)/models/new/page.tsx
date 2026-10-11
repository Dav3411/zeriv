"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useTranslations } from "next-intl";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import { useJobQueue } from "@/components/JobQueueProvider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CandidateItem = {
  image_b64: string;
  face_seed: number;
  face_prompt: string;
  model?: string;
  lora?: string | null;
};

type JobStatusResponse = {
  job?: {
    id: string;
    status: string;
    progress: number;
    error?: string | null;
    result?: { model_id?: string } | null;
  };
};

type WizardStep = 1 | 2 | 3 | 4 | 5;

type ModelDraft = {
  name: string;
  gender: string;
  ageGroup: string;
  faceType: string;
  hairStyle: string;
  hasBang: boolean;
  styleVibe: string;
  heightCm: number;
  bodyType: string;
  skinTone: string;
  faceShape: string;
  doubleEyelid: string;
  stage: "setup" | "generating";
  wizardStep: WizardStep;
  selectedCandidate: CandidateItem | null;
  autoConfirm: boolean;
};

const DRAFT_KEY = "zeriv_model_draft";
const PENDING_JOB_KEY = "zeriv_pending_model_job";

// ---------------------------------------------------------------------------
// Option data
// ---------------------------------------------------------------------------

const GENDER_VALUES = ["female", "male"] as const;
const GENDER_ICONS: Record<string, string> = { female: "♀", male: "♂" };

const AGE_GROUP_VALUES = [
  "early_20s",
  "late_20s",
  "early_30s",
  "late_30s",
  "early_40s",
  "late_40s",
] as const;
const AGE_GROUP_KEYS: Record<string, string> = {
  early_20s: "ageEarly20s",
  late_20s: "ageLate20s",
  early_30s: "ageEarly30s",
  late_30s: "ageLate30s",
  early_40s: "ageEarly40s",
  late_40s: "ageLate40s",
};

const FACE_TYPE_VALUES = [
  "dog",
  "cat",
  "fox",
  "rabbit",
  "deer",
  "snake",
  "hamster",
] as const;
const FACE_TYPE_EMOJIS: Record<string, string> = {
  dog: "🐶",
  cat: "🐱",
  fox: "🦊",
  rabbit: "🐰",
  deer: "🦌",
  snake: "🐍",
  hamster: "🐹",
};
const FACE_TYPE_KEYS: Record<string, string> = {
  dog: "faceDog",
  cat: "faceCat",
  fox: "faceFox",
  rabbit: "faceRabbit",
  deer: "faceDeer",
  snake: "faceSnake",
  hamster: "faceHamster",
};

const HAIR_STYLE_FEMALE = [
  "long",
  "wave_long",
  "bob",
  "wave_bob",
  "shoulder_length",
  "ponytail",
  "hime",
  "updo",
  "shaggy",
  "pixie",
  "short",
] as const;
const HAIR_STYLE_MALE = [
  "twoblock",
  "curtains",
  "garma_perm",
  "textured_crop",
  "perm",
  "wolf_cut",
  "slick_back_undercut",
  "fade",
  "crew_cut",
  "shaggy",
  "short",
  "long",
] as const;
const HAIR_STYLE_KEYS: Record<string, string> = {
  long: "hairLong",
  bob: "hairBob",
  wave_long: "hairWaveLong",
  wave_bob: "hairWaveBob",
  pixie: "hairPixie",
  short: "hairShort",
  updo: "hairUpdo",
  ponytail: "hairPonytail",
  shaggy: "hairShaggy",
  braids: "hairBraided",
  hime: "hairHimeCut",
  // male
  buzz_cut: "hairBuzzCut",
  crew_cut: "hairCrewCut",
  twoblock: "hairTwoBlock",
  slick_back_undercut: "hairSlickBackUndercut",
  fade: "hairFade",
  curtains: "hairCurtains",
  center_part: "hairCenterPart",
  textured_crop: "hairTexturedCrop",
  regent: "hairRegent",
  wolf_cut: "hairWolfCut",
  perm: "hairPerm",
  man_bun: "hairManBun",
  garma_perm: "hairGarmaPerm",
  shoulder_length: "hairShoulderLength",
};

const SKIN_TONE_VALUES = ["light", "medium", "tan"] as const;
const SKIN_TONE_LABELS: Record<string, string> = {
  light: "밝은",
  medium: "보통",
  tan: "어두운",
};
const SKIN_TONE_SWATCH: Record<string, string> = {
  light: "#f5dbc4",
  medium: "#d9a87a",
  tan: "#a06a3f",
};

const FACE_SHAPE_VALUES = ["oval", "round", "square", "heart"] as const;
const FACE_SHAPE_LABELS: Record<string, string> = {
  oval: "계란형",
  round: "둥근형",
  square: "각진형",
  heart: "하트형",
};

const DOUBLE_EYELID_VALUES = ["double", "mono", "inner"] as const;
const DOUBLE_EYELID_LABELS: Record<string, string> = {
  double: "쌍커풀",
  mono: "무쌍",
  inner: "속쌍",
};

const NO_BANG_HAIR_STYLES = new Set([
  "pixie",
  "updo",
  "ponytail",
  "braids",
  "curtains",
  "crew_cut",
  "fade",
  "slick_back_undercut",
]);

const STYLE_VIBE_VALUES = [
  "k_beauty_standard",
  "k_pop_idol",
  "asian_influencer",
] as const;
const STYLE_VIBE_KEYS: Record<string, string> = {
  k_beauty_standard: "vibeKBeauty",
  pure: "vibePure",
  cute: "vibeCute",
  chic: "vibeChic",
  elegant: "vibeElegant",
  glam: "vibeGlam",
  dreamy: "vibeDreamy",
  soft_cool: "vibeSoftCool",
  athletic: "vibeAthletic",
  intellectual: "vibeIntellectual",
  indie: "vibeIndie",
  model: "vibeModel",
  cyberpunk: "vibeCyberpunk",
  k_pop_idol: "vibeKPopIdol",
  fresh_fruit_girl: "vibeFreshFruitGirl",
  cold_beauty: "vibeColdBeauty",
  anime_heroine: "vibeAnimeHeroine",
  seoul_street: "vibeSeoulStreet",
  tokyo_harajuku: "vibeTokyoHarajuku",
  j_idol_2d: "vibeJIdol2d",
  jk: "vibeJK",
  city_pop_vibe: "vibeCityPop",
  wanghong: "vibeWanghong",
  pure_seductive: "vibePureSeductive",
  dominant_elegant: "vibeDominantElegant",
  sweet_girl: "vibeSweetGirl",
  hong_kong_vintage: "vibeHKVintage",
  cinematic_retro: "vibeCinematicRetro",
  taipei_indie: "vibeTaipeiIndie",
  acoustic_youth: "vibeAcousticYouth",
  taiwanese_romance: "vibeTaiwaneseRomance",
  dark_street: "vibeDarkStreet",
  gyaru: "vibeGyaru",
  asian_influencer: "vibeAsianInfluencer",
};

// Visual style card data: gradient + emoji for each vibe
const STYLE_VIBE_VISUALS: Record<string, { gradient: string; emoji: string }> =
  {
    pure: { gradient: "linear-gradient(135deg,#f8e8ff,#ffe8f0)", emoji: "🌸" },
    cute: { gradient: "linear-gradient(135deg,#ffcfe8,#ffd6a5)", emoji: "🍬" },
    chic: { gradient: "linear-gradient(135deg,#2d2d2d,#5a4a6a)", emoji: "🖤" },
    elegant: {
      gradient: "linear-gradient(135deg,#c9a96e,#f0e6d3)",
      emoji: "🥂",
    },
    glam: { gradient: "linear-gradient(135deg,#c471ed,#f64f59)", emoji: "💎" },
    dreamy: {
      gradient: "linear-gradient(135deg,#a8edea,#fed6e3)",
      emoji: "🌙",
    },
    soft_cool: {
      gradient: "linear-gradient(135deg,#c2e9fb,#a1c4fd)",
      emoji: "❄️",
    },
    athletic: {
      gradient: "linear-gradient(135deg,#f7971e,#ffd200)",
      emoji: "⚡",
    },
    intellectual: {
      gradient: "linear-gradient(135deg,#373b44,#4286f4)",
      emoji: "📚",
    },
    indie: { gradient: "linear-gradient(135deg,#d4a574,#8b6c42)", emoji: "🎸" },
    model: { gradient: "linear-gradient(135deg,#1a1a2e,#e94560)", emoji: "👠" },
    cyberpunk: {
      gradient: "linear-gradient(135deg,#0f0c29,#302b63,#24243e)",
      emoji: "🤖",
    },
    k_pop_idol: {
      gradient: "linear-gradient(135deg,#ff6b6b,#ffd93d)",
      emoji: "🌟",
    },
    k_beauty_standard: {
      gradient: "linear-gradient(135deg,#ffecd2,#fcb69f)",
      emoji: "✨",
    },
    fresh_fruit_girl: {
      gradient: "linear-gradient(135deg,#a8ff78,#78ffd6)",
      emoji: "🍑",
    },
    cold_beauty: {
      gradient: "linear-gradient(135deg,#e0eafc,#cfdef3)",
      emoji: "🧊",
    },
    anime_heroine: {
      gradient: "linear-gradient(135deg,#f953c6,#b91d73)",
      emoji: "⚔️",
    },
    seoul_street: {
      gradient: "linear-gradient(135deg,#232526,#414345)",
      emoji: "🏙️",
    },
    tokyo_harajuku: {
      gradient: "linear-gradient(135deg,#f7971e,#ff6eb4)",
      emoji: "🎌",
    },
    j_idol_2d: {
      gradient: "linear-gradient(135deg,#a18cd1,#fbc2eb)",
      emoji: "🎀",
    },
    jk: { gradient: "linear-gradient(135deg,#f5f5f5,#dfe9f3)", emoji: "🎒" },
    city_pop_vibe: {
      gradient: "linear-gradient(135deg,#f093fb,#f5576c)",
      emoji: "📻",
    },
    wanghong: {
      gradient: "linear-gradient(135deg,#ff9a9e,#fad0c4)",
      emoji: "📱",
    },
    pure_seductive: {
      gradient: "linear-gradient(135deg,#fbc2eb,#a6c1ee)",
      emoji: "🌹",
    },
    dominant_elegant: {
      gradient: "linear-gradient(135deg,#1c1c1c,#8b0000)",
      emoji: "🕷️",
    },
    sweet_girl: {
      gradient: "linear-gradient(135deg,#fddb92,#d1fdff)",
      emoji: "🍰",
    },
    hong_kong_vintage: {
      gradient: "linear-gradient(135deg,#c79081,#dfa579)",
      emoji: "🌃",
    },
    cinematic_retro: {
      gradient: "linear-gradient(135deg,#b79891,#94716b)",
      emoji: "🎬",
    },
    taipei_indie: {
      gradient: "linear-gradient(135deg,#4facfe,#00f2fe)",
      emoji: "🌿",
    },
    acoustic_youth: {
      gradient: "linear-gradient(135deg,#e0c3fc,#8ec5fc)",
      emoji: "🎵",
    },
    taiwanese_romance: {
      gradient: "linear-gradient(135deg,#fccb90,#d57eeb)",
      emoji: "💐",
    },
    dark_street: {
      gradient: "linear-gradient(135deg,#0d0d0d,#1a1a2e)",
      emoji: "🌑",
    },
    gyaru: { gradient: "linear-gradient(135deg,#f7971e,#ff6eb4)", emoji: "💅" },
    asian_influencer: {
      gradient: "linear-gradient(135deg,#ffe4c4,#ffd700)",
      emoji: "📸",
    },
  };

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3.5 py-2 rounded-2xl text-sm font-medium transition-all"
      style={
        selected
          ? {
              background: "rgba(255,164,198,0.08)",
              border: "1px solid rgba(255,164,198,0.4)",
              color: "#ffa4c6",
              boxShadow: "0 4px 16px rgba(255,164,198,0.1)",
            }
          : {
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
            }
      }
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-xs uppercase tracking-widest font-semibold mb-2.5"
      style={{ color: "rgba(255,164,198,0.9)" }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard Header — progress bar + numbered step row
// ---------------------------------------------------------------------------

const STEP_LABELS_KO = ["성별", "바이브", "이름 & 외모", "체형", "미리보기"];

function WizardHeader({ current }: { current: WizardStep }) {
  const total = 5;
  const pct = Math.round(((current - 1) / (total - 1)) * 100); // 0%~100%

  return (
    <div className="w-full pt-4 pb-0">
      <div className="flex items-center justify-between mb-3">
        <h1
          className="font-headline text-3xl font-bold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          모델 생성
        </h1>
        <span className="text-[10px] font-bold" style={{ color: "#ffe3be" }}>
          {pct}%
        </span>
      </div>

      {/* Unified step progress: single bar with circles on top */}
      <div className="relative">
        {/* Track */}
        <div
          className="absolute top-3 h-0.5 rounded-full"
          style={{ left: 12, right: 12, background: "var(--surface-3)" }}
        />
        {/* Fill */}
        <div
          className="absolute top-3 h-0.5 rounded-full transition-all duration-500"
          style={{
            left: 12,
            width: `calc((100% - 24px) * ${pct} / 100)`,
            background: "linear-gradient(90deg, #ffa4c6, #ffe3be)",
          }}
        />
        {/* Step circles */}
        <div className="relative flex items-start justify-between">
          {Array.from({ length: total }, (_, i) => {
            const stepNum = (i + 1) as WizardStep;
            const done = stepNum < current;
            const active = stepNum === current;
            return (
              <div key={i} className="flex flex-col items-center relative z-10">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300"
                  style={
                    done
                      ? {
                          background: "var(--surface-1)",
                          border: "2px solid #ffa4c6",
                          color: "#ffa4c6",
                        }
                      : active
                        ? {
                            background:
                              "linear-gradient(135deg,#ffa4c6,#ffe3be)",
                            color: "#000",
                          }
                        : {
                            background: "var(--surface-2)",
                            border: "2px solid var(--border-hover)",
                            color: "var(--text-muted)",
                          }
                  }
                >
                  {done ? "✓" : stepNum}
                </div>
                <div
                  className="text-[9px] mt-1 text-center font-medium transition-colors"
                  style={{
                    color: active
                      ? "#ffe3be"
                      : done
                        ? "rgba(255,164,198,0.9)"
                        : "var(--text-muted)",
                  }}
                >
                  {STEP_LABELS_KO[i]}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login Gate Modal
// ---------------------------------------------------------------------------

function LoginGateModal({
  onClose,
  onSave,
  t,
  brandIdFromUrl,
}: {
  onClose: () => void;
  onSave: () => void;
  t: (key: string) => string;
  brandIdFromUrl: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl p-6 flex flex-col gap-5"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="text-center">
          <div className="text-3xl mb-3">🔐</div>
          <div
            className="text-lg font-bold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            {t("loginRequired")}
          </div>
          <div
            className="text-sm leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            {t("loginRequiredDesc")}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href={`/signup?next=/${brandIdFromUrl}/models/new`}
            onClick={onSave}
            className="w-full py-3 rounded-xl text-sm font-bold text-center shadow-lg shadow-pink-500/20 transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
              color: "#000",
            }}
          >
            {t("goToSignup")}
          </Link>
          <Link
            href={`/signup?next=/${brandIdFromUrl}/models/new`}
            onClick={onSave}
            className="w-full py-3 rounded-xl text-sm font-semibold text-center transition-all"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            {t("goToLogin")}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 rounded-xl text-xs transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            {t("modalBack")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm modal
// ---------------------------------------------------------------------------

function ConfirmModal({
  selected,
  name,
  onConfirm,
  onCancel,
  confirming,
  t,
}: {
  selected: CandidateItem;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
  t: (key: string) => string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="aspect-square relative overflow-hidden">
          <img
            src={`data:image/png;base64,${selected.image_b64}`}
            alt={name}
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface-0)] via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <div className="text-xl font-bold text-white">{name}</div>
            <div
              className="text-xs mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              {t("confirmQuestion")}
            </div>
          </div>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            {t("modalBack")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="py-3 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-pink-500/20"
            style={{
              background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
              color: "#000",
            }}
          >
            {confirming ? t("modalCreating") : t("modalConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page content
// ---------------------------------------------------------------------------

function ModelCreateContent() {
  const router = useRouter();
  const { brandName: brandIdFromUrl } = useParams<{ brandName: string }>();
  const { user, loading: authLoading } = useAuth();
  const { fetchWithAuth } = useFetchWithAuth();
  const { addJob } = useJobQueue();
  const t = useTranslations("personaCreate");
  const tc = useTranslations("common");

  // Wizard step (1=성별, 2=스타일, 3=이름&외모, 4=체형, 5=미리보기)
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);

  // Form state
  const [name, setName] = useState("");
  const [gender, setGender] = useState<string>("");
  const [ageGroup, setAgeGroup] = useState<string>("");
  const [faceType, setFaceType] = useState<string>("");
  const [hairStyle, setHairStyle] = useState<string>("");
  const [hasBang, setHasBang] = useState<boolean>(true);
  const [styleVibe, setStyleVibe] = useState<string>("");
  const [heightCm, setHeightCm] = useState<number>(165);
  const [bodyType, setBodyType] = useState<string>("");
  const [skinTone, setSkinTone] = useState<string>("");
  const [faceShape, setFaceShape] = useState<string>("");
  const [doubleEyelid, setDoubleEyelid] = useState<string>("");

  // 4 candidates
  const [generating, setGenerating] = useState(false);
  const [candidates, setCandidates] = useState<(CandidateItem | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const [selectedCandidate, setSelectedCandidate] =
    useState<CandidateItem | null>(null);
  const [generatingError, setGeneratingError] = useState<string | null>(null);

  // UI phase within step 5
  const [stage, setStage] = useState<"setup" | "generating">("setup");

  // Model limit check state
  const [limitCheckDone, setLimitCheckDone] = useState(false);
  const [isModelLimitExceeded, setIsModelLimitExceeded] = useState(false);
  const [modelLimitInfo, setModelLimitInfo] = useState<{
    current: number;
    limit: number;
  } | null>(null);

  // Confirm/job state
  const [showConfirm, setShowConfirm] = useState(false);
  const [showLoginGate, setShowLoginGate] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobDone, setJobDone] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [autoConfirmPending, setAutoConfirmPending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const limitCheckedRef = useRef(false);

  // Restore state after login or page re-entry.
  // Priority: pending job (localStorage) > draft (sessionStorage).
  useEffect(() => {
    if (!user || authLoading) return;

    // 1순위: 저장 중 이탈 후 재진입 — pending job 복원
    const pendingRaw = localStorage.getItem(PENDING_JOB_KEY);
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw) as {
          jobId: string;
          name: string;
          selectedCandidate: CandidateItem | null;
          brandId: string;
        };
        if (pending.jobId && pending.brandId === brandIdFromUrl) {
          localStorage.removeItem(PENDING_JOB_KEY);
          sessionStorage.removeItem(DRAFT_KEY);
          setName(pending.name);
          if (pending.selectedCandidate) {
            setSelectedCandidate(pending.selectedCandidate);
            setCandidates([pending.selectedCandidate, null, null, null]);
          }
          setWizardStep(5 as WizardStep);
          setStage("generating");
          setJobId(pending.jobId);
          setConfirming(true);
          return;
        }
      } catch {
        /* ignore */
      }
    }

    // 2순위: 로그인 후 draft 복원
    const draftRaw = sessionStorage.getItem(DRAFT_KEY);
    if (!draftRaw) return;
    try {
      const draft = JSON.parse(draftRaw) as ModelDraft;
      sessionStorage.removeItem(DRAFT_KEY);
      setName(draft.name);
      setGender(draft.gender);
      setAgeGroup(draft.ageGroup);
      setFaceType(draft.faceType);
      setHairStyle(draft.hairStyle);
      if (draft.hasBang !== undefined) setHasBang(draft.hasBang);
      setStyleVibe(draft.styleVibe);
      setHeightCm(draft.heightCm);
      setBodyType(draft.bodyType);
      if (draft.skinTone !== undefined) setSkinTone(draft.skinTone);
      if (draft.faceShape !== undefined) setFaceShape(draft.faceShape);
      if (draft.doubleEyelid !== undefined) setDoubleEyelid(draft.doubleEyelid);
      setStage(draft.stage);
      setWizardStep(draft.wizardStep);
      if (draft.selectedCandidate) {
        setSelectedCandidate(draft.selectedCandidate);
        setCandidates([draft.selectedCandidate, null, null, null]);
      }
      if (draft.autoConfirm) setAutoConfirmPending(true);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // Poll job status after confirm
  useEffect(() => {
    if (!jobId || jobDone) return;
    const poll = async () => {
      try {
        const res = await fetchWithAuth(`/api/jobs/${jobId}?_t=${Date.now()}`);
        if (!res.ok) return;
        const data = (await res.json()) as JobStatusResponse;
        const status = data.job?.status;
        if (status === "succeeded") {
          clearInterval(pollRef.current!);
          // 브랜드 연결의 1차 책임은 worker 가 진다 (create-job 에서 brand_id 를
          // 페이로드로 받아 worker 가 모델 INSERT 시 brand_id 까지 설정).
          // 이 fallback 은 멱등하므로(같은 brand_id 를 재할당) 구버전 worker 로
          // 인큐된 잡이나 worker 가 brand 검증에 실패한 경우의 보완 경로다.
          const createdModelId = data.job?.result?.model_id;
          if (brandIdFromUrl && createdModelId) {
            fetchWithAuth(`/api/brands/${brandIdFromUrl}/models`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                influencerId: createdModelId,
                role: "primary",
              }),
            }).catch(() => {
              /* 실패해도 생성은 성공 — worker 가 이미 처리했을 가능성이 높다 */
            });
          }
          try {
            localStorage.removeItem(PENDING_JOB_KEY);
          } catch {
            /* ignore */
          }
          setJobDone(true);
          setConfirming(false);
        } else if (status === "failed") {
          clearInterval(pollRef.current!);
          try {
            localStorage.removeItem(PENDING_JOB_KEY);
          } catch {
            /* ignore */
          }
          setJobError(data.job?.error ?? "Creation failed");
          setConfirming(false);
        }
      } catch {
        /* keep polling */
      }
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current!);
  }, [jobId, jobDone, fetchWithAuth, brandIdFromUrl]);

  const modelParams = useCallback(
    () => ({
      name: name.trim() || "Preview",
      gender,
      age_group: ageGroup,
      face_type: faceType,
      hair_style: hairStyle,
      bang: hasBang ? "has_bang" : "none",
      style_vibe: styleVibe,
      height_cm: heightCm,
      body_type: bodyType,
      skin_tone: skinTone,
      face_shape: faceShape,
      double_eyelid: doubleEyelid,
    }),
    [
      name,
      gender,
      ageGroup,
      faceType,
      hairStyle,
      hasBang,
      styleVibe,
      heightCm,
      bodyType,
      skinTone,
      faceShape,
      doubleEyelid,
    ],
  );

  const saveDraft = useCallback(
    (autoConfirm: boolean) => {
      const draft: ModelDraft = {
        name,
        gender,
        ageGroup,
        faceType,
        hairStyle,
        hasBang,
        styleVibe,
        heightCm,
        bodyType,
        skinTone,
        faceShape,
        doubleEyelid,
        stage,
        wizardStep,
        selectedCandidate,
        autoConfirm,
      };
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        /* ignore */
      }
    },
    [
      name,
      gender,
      ageGroup,
      faceType,
      hairStyle,
      hasBang,
      styleVibe,
      heightCm,
      bodyType,
      skinTone,
      faceShape,
      doubleEyelid,
      stage,
      wizardStep,
      selectedCandidate,
    ],
  );

  const handleGenerate = useCallback(async () => {
    setGeneratingError(null);
    setGenerating(true);
    setSelectedCandidate(null);
    setCandidates([null, null, null, null]);
    setStage("generating");

    try {
      const res = await fetchWithAuth("/api/personas/candidates/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modelParams()),
      });
      if (!res.ok) {
        const data = await res.json();
        setGeneratingError(data.error ?? "Candidate generation failed");
        setStage("setup");
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let firstCandidate = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as {
              index?: number;
              candidate?: CandidateItem | null;
              error?: string;
            };
            if (parsed.candidate && parsed.index !== undefined) {
              const idx = parsed.index;
              setCandidates((prev) => {
                const next = [...prev];
                next[idx] = parsed.candidate!;
                return next;
              });
              if (firstCandidate) {
                setSelectedCandidate(parsed.candidate!);
                firstCandidate = false;
              }
            } else if (parsed.error && parsed.index === undefined) {
              setGeneratingError(parsed.error);
            }
          } catch {
            // 파싱 실패 무시
          }
        }
      }
    } catch (e) {
      setGeneratingError(String(e));
      setStage("setup");
    } finally {
      setGenerating(false);
    }
  }, [modelParams, fetchWithAuth]);

  const handleConfirm = useCallback(async () => {
    const chosen = selectedCandidate;
    if (!chosen) return;

    // Login gate
    if (!user) {
      saveDraft(true);
      setShowLoginGate(true);
      return;
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setJobError("Name must be at least 2 characters.");
      return;
    }
    setConfirming(true);
    setJobError(null);
    setShowConfirm(false);

    try {
      const res = await fetchWithAuth("/api/personas/create-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...modelParams(),
          name: trimmedName,
          image_b64: chosen.image_b64,
          face_seed: chosen.face_seed,
          face_prompt: chosen.face_prompt,
          // brand 컨텍스트가 있으면 worker 가 모델 INSERT 시 brand_id 까지 함께
          // 설정하도록 전달한다. 이렇게 해야 사용자가 폴링 도중 페이지를 이탈해도
          // 모델이 브랜드에 정상 연결된다 (클라이언트 폴링의 후속 호출 의존 제거).
          ...(brandIdFromUrl ? { brand_id: brandIdFromUrl } : {}),
          ...(chosen.model
            ? {
                lora_config: {
                  model: chosen.model,
                  lora: chosen.lora ?? null,
                },
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJobError(data.error ?? "Failed to create model");
        setConfirming(false);
        return;
      }
      const jId = data.jobId as string;
      setJobId(jId);
      try {
        localStorage.setItem(
          PENDING_JOB_KEY,
          JSON.stringify({
            jobId: jId,
            name: trimmedName,
            selectedCandidate: chosen,
            brandId: brandIdFromUrl,
          }),
        );
      } catch {
        /* ignore — image_b64가 커서 quota 초과 시 조용히 넘어감 */
      }
      addJob({ id: jId, kind: "persona", name: trimmedName });
    } catch (e) {
      setJobError(String(e));
      setConfirming(false);
    }
  }, [
    selectedCandidate,
    user,
    name,
    modelParams,
    fetchWithAuth,
    addJob,
    saveDraft,
    brandIdFromUrl,
  ]);

  // After login restore: auto-confirm when state is ready
  useEffect(() => {
    if (!autoConfirmPending || !user) return;
    const chosen = selectedCandidate;
    if (!chosen) return;
    setAutoConfirmPending(false);
    handleConfirm();
  }, [autoConfirmPending, user, selectedCandidate, handleConfirm]);

  // 스텝 5 진입 시 자동으로 ComfyUI 4장 생성 시작
  useEffect(() => {
    if (wizardStep === 5 && stage === "setup" && !generating) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep]);

  // 페이지 진입 시 모델 한도 체크
  useEffect(() => {
    if (limitCheckedRef.current) return;
    if (authLoading || !user || !brandIdFromUrl) {
      if (!authLoading && !user) setLimitCheckDone(true); // 비로그인은 체크 불필요
      return;
    }
    limitCheckedRef.current = true;

    fetchWithAuth(`/api/personas?brandId=${brandIdFromUrl}`)
      .then(async (res) => {
        if (!res.ok) {
          setLimitCheckDone(true);
          return;
        }
        const data = (await res.json()) as {
          models: unknown[];
          modelCount?: number;
          modelLimit?: number | null;
        };
        const current =
          (data.modelCount as number | undefined) ?? data.models.length;
        const limit = data.modelLimit ?? null;
        if (limit !== null && current >= limit) {
          setIsModelLimitExceeded(true);
          setModelLimitInfo({ current, limit });
        }
        setLimitCheckDone(true);
      })
      .catch(() => setLimitCheckDone(true)); // 오류 시 통과 허용
  }, [authLoading, user, brandIdFromUrl, fetchWithAuth]);

  if (authLoading) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <div style={{ color: "var(--text-muted)" }}>{tc("loading")}</div>
      </div>
    );
  }

  // 로딩 중 (인증 완료 후 한도 체크 대기)
  if (user && !limitCheckDone) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <div style={{ color: "var(--text-muted)" }}>{tc("loading")}</div>
      </div>
    );
  }

  // 모델 한도 초과 블로킹 화면
  if (isModelLimitExceeded && modelLimitInfo) {
    const isNotIncluded = modelLimitInfo.limit === 0;
    return (
      <div
        className="fixed inset-0 flex items-center justify-center p-6"
        style={{
          background:
            "radial-gradient(ellipse at 60% 40%, #1a0a2e 0%, var(--surface-0) 70%)",
        }}
      >
        <div
          className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="px-7 pt-8 pb-6 flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <div
                className="text-xs uppercase tracking-widest font-semibold"
                style={{ color: "rgba(255,164,198,0.9)" }}
              >
                {isNotIncluded ? "플랜 제한" : "모델 한도"}
              </div>
              {!isNotIncluded && (
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="text-4xl font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {modelLimitInfo.current}
                  </span>
                  <span
                    className="text-xl font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    /
                  </span>
                  <span
                    className="text-xl font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {modelLimitInfo.limit}
                  </span>
                </div>
              )}
            </div>
            <div
              className="h-px w-full"
              style={{ background: "var(--surface-3)" }}
            />
            <div className="flex flex-col gap-1.5">
              <div
                className="text-base font-bold leading-snug"
                style={{ color: "var(--text-primary)" }}
              >
                {isNotIncluded
                  ? "현재 플랜에서는 사용할 수 없습니다"
                  : "모델 한도에 도달했습니다"}
              </div>
              <div
                className="text-sm leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {isNotIncluded
                  ? "AI 모델 생성은 Atelier 플랜부터 이용 가능합니다. 플랜을 업그레이드해주세요."
                  : "현재 플랜에서 생성할 수 있는 모델 수를 초과했습니다. 기존 모델을 삭제하거나 플랜을 업그레이드하세요."}
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              {!isNotIncluded && (
                <Link
                  href={`/${brandIdFromUrl}/assets?tab=models`}
                  className="w-full py-3.5 rounded-full text-sm font-semibold text-center transition-all"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  기존 모델 관리하기
                </Link>
              )}
              <Link
                href="/pricing"
                className="w-full flex items-center justify-center gap-2.5 py-3.5 pl-5 pr-2 rounded-full text-sm font-bold transition-all active:scale-95"
                style={{
                  background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                  color: "#000",
                  boxShadow: "0 4px 16px rgba(255,164,198,0.3)",
                }}
              >
                플랜 업그레이드
                <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-sm">
                  →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Job done screen ----
  const doneImage = selectedCandidate?.image_b64;

  // image_b64가 localStorage quota 초과로 저장되지 않은 경우 이미지 없이 완료 화면 표시
  if (jobDone && !doneImage) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center p-6"
        style={{
          background:
            "radial-gradient(ellipse at 60% 40%, #1a0a2e 0%, var(--surface-0) 70%)",
        }}
      >
        <div
          className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,164,198,0.15)" }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ffa4c6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-pink-400 mb-1">
                {t("personaCreated")}
              </div>
              <div
                className="text-2xl font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                {name.trim()}
              </div>
            </div>
          </div>
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem(PENDING_JOB_KEY);
                } catch {}
                setJobDone(false);
                setJobId(null);
                setSelectedCandidate(null);
                setCandidates([null, null, null, null]);
                setStage("setup");
                setWizardStep(1 as WizardStep);
                setName("");
              }}
              className="py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              {t("createAnother")}
            </button>
            <Link
              href={`/${brandIdFromUrl}/assets`}
              className="flex items-center justify-center gap-2.5 py-3 pl-5 pr-2 rounded-full text-sm font-bold shadow-lg"
              style={{
                background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                color: "#000",
              }}
            >
              {t("viewBrandModels")}
              <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-sm">
                →
              </span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (jobDone && doneImage) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center p-6"
        style={{
          background:
            "radial-gradient(ellipse at 60% 40%, #1a0a2e 0%, var(--surface-0) 70%)",
        }}
      >
        <div
          className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="aspect-square relative overflow-hidden">
            <img
              src={`data:image/png;base64,${doneImage}`}
              alt={name}
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface-0)] via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4">
              <div className="text-[10px] uppercase tracking-widest text-pink-400 mb-1">
                {t("personaCreated")}
              </div>
              <div className="text-2xl font-bold text-white">{name.trim()}</div>
            </div>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem(PENDING_JOB_KEY);
                } catch {
                  /* ignore */
                }
                setJobDone(false);
                setJobId(null);
                setSelectedCandidate(null);
                setCandidates([null, null, null, null]);
                setStage("setup");
                setWizardStep(1 as WizardStep);
                setName("");
              }}
              className="py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              {t("createAnother")}
            </button>
            <Link
              href={`/${brandIdFromUrl}/assets`}
              className="flex items-center justify-center gap-2.5 py-3 pl-5 pr-2 rounded-full text-sm font-bold shadow-lg"
              style={{
                background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                color: "#000",
              }}
            >
              {t("viewBrandModels")}
              <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-sm">
                →
              </span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Step canProceed guards
  const canStep1Next = !!gender; // 성별
  const canStep2Next = !!styleVibe; // 스타일
  const canStep3Next =
    name.trim().length >= 2 &&
    !!ageGroup &&
    !!faceType &&
    !!hairStyle &&
    !!skinTone &&
    !!faceShape &&
    !!doubleEyelid; // 이름&외모
  const canStep4Next = !!bodyType; // 체형

  const hairOptions = gender === "male" ? HAIR_STYLE_MALE : HAIR_STYLE_FEMALE;

  return (
    <div className="flex flex-col items-center relative -mt-10 -mb-10 -mx-6 sm:-mx-10 overflow-hidden h-[calc(100dvh_-_2.75rem)] lg:h-[calc(100dvh_-_3.5rem)]">
      {/* Modals */}
      {showConfirm && selectedCandidate?.image_b64 && (
        <ConfirmModal
          selected={selectedCandidate}
          name={name.trim() || "Model"}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          confirming={confirming}
          t={t as (key: string) => string}
        />
      )}
      {showLoginGate && (
        <LoginGateModal
          onClose={() => setShowLoginGate(false)}
          onSave={() => saveDraft(true)}
          t={t as (key: string) => string}
          brandIdFromUrl={brandIdFromUrl}
        />
      )}

      {/* Full-height wizard content */}
      <div className="flex-1 min-h-0 flex flex-col w-full px-4 md:px-8 pb-6">
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Progress */}
          <div style={{ marginBottom: "clamp(8px, 1.5vh, 16px)" }}>
            <WizardHeader current={wizardStep} />
          </div>

          {/* Main area: character card (1/3) + step card (2/3) */}
          <div
            className="flex-1 min-h-0 flex overflow-hidden"
            style={{
              gap: "clamp(8px, 1.5vw, 24px)",
              padding: "clamp(4px, 1vh, 16px) 0",
            }}
          >
            {/* Left — Model card, hidden on step 1 */}
            <div
              className={`w-[24%] min-w-[180px] shrink-0 rounded-2xl overflow-hidden relative flex flex-col ${wizardStep === 1 ? "hidden" : ""}`}
              style={{
                border: "1px solid rgba(255,164,198,0.5)",
                boxShadow: "none",
              }}
            >
              {/* Full background */}
              <div
                className="absolute inset-0"
                style={{
                  background: "var(--surface-1)",
                }}
              />
              {/* Corner accent lines */}
              {[
                "absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 rounded-tl-lg pointer-events-none",
                "absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 rounded-tr-lg pointer-events-none",
                "absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 rounded-bl-lg pointer-events-none",
                "absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 rounded-br-lg pointer-events-none",
              ].map((cls, i) => (
                <div
                  key={i}
                  className={cls}
                  style={{
                    borderColor: "rgba(255,164,198,0.5)",
                  }}
                />
              ))}

              {/* Content */}
              <div className="relative z-10 flex flex-col h-full">
                {/* Model label */}
                <div
                  style={{
                    padding:
                      "clamp(10px, 1.5vh, 20px) clamp(10px, 1.5vw, 20px) 0",
                  }}
                >
                  <span
                    className="text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded"
                    style={{
                      color: "rgba(255,164,198,0.9)",
                      background: "rgba(255,164,198,0.1)",
                      border: "1px solid rgba(255,164,198,0.2)",
                    }}
                  >
                    Model
                  </span>
                </div>

                {/* Avatar */}
                <div
                  style={{
                    padding: "clamp(4px, 0.8vh, 8px) clamp(8px, 1.2vw, 24px) 0",
                  }}
                >
                  <div
                    className="w-full aspect-square flex items-center justify-center text-8xl rounded-2xl overflow-hidden relative"
                    style={{
                      background: "var(--surface-1)",
                      boxShadow: "none",
                    }}
                  >
                    {/* Silhouette placeholder */}
                    <img
                      src={
                        gender === "male"
                          ? "/model-silhouette-male.png"
                          : "/model-silhouette-female.png"
                      }
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover object-top scale-110 translate-y-[5%]"
                    />
                    {/* Bottom-left overlay: gender icon + name */}
                    <div
                      className="absolute bottom-0 left-0 right-0 px-3 py-2.5 flex items-end gap-1.5"
                      style={{
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 40%, transparent 100%)",
                      }}
                    >
                      {gender && (
                        <span
                          className="text-xl leading-none shrink-0"
                          style={{
                            color: gender === "female" ? "#ffa4c6" : "#A0D4FF",
                          }}
                        >
                          {gender === "female" ? "♀" : "♂"}
                        </span>
                      )}
                      {name.trim() ? (
                        <span className="text-xl font-bold text-always-white leading-none truncate">
                          {name.trim()}
                        </span>
                      ) : (
                        <span
                          className="text-base leading-none italic"
                          style={{ color: "rgba(255,255,255,0.65)" }}
                        >
                          이름 미설정
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div
                  className="h-px"
                  style={{
                    margin:
                      "clamp(8px, 1.5vh, 16px) clamp(12px, 2vw, 32px) clamp(6px, 1vh, 12px)",
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,164,198,0.4), transparent)",
                  }}
                />

                {/* Stat list */}
                <div
                  className="flex-1 min-h-0 overflow-y-auto space-y-2"
                  style={{
                    padding: "0 clamp(12px, 2vw, 32px) clamp(12px, 2vh, 24px)",
                  }}
                >
                  {[
                    {
                      label: "나이대",
                      value: ageGroup
                        ? t(AGE_GROUP_KEYS[ageGroup] as Parameters<typeof t>[0])
                        : "",
                      color: "#c4b5fd",
                    },
                    {
                      label: "바이브",
                      value: styleVibe
                        ? t(
                            STYLE_VIBE_KEYS[styleVibe] as Parameters<
                              typeof t
                            >[0],
                          )
                        : "",
                      color: "#ffa4c6",
                    },
                    {
                      label: "동물상",
                      value: faceType
                        ? `${FACE_TYPE_EMOJIS[faceType]} ${t(FACE_TYPE_KEYS[faceType] as Parameters<typeof t>[0])}`
                        : "",
                      color: "#fdba74",
                    },
                    {
                      label: "피부톤",
                      value: skinTone ? SKIN_TONE_LABELS[skinTone] : "",
                      color: "#fcd5b0",
                    },
                    {
                      label: "얼굴형",
                      value: faceShape ? FACE_SHAPE_LABELS[faceShape] : "",
                      color: "#fca5a5",
                    },
                    {
                      label: "쌍커풀",
                      value: doubleEyelid
                        ? DOUBLE_EYELID_LABELS[doubleEyelid]
                        : "",
                      color: "#f9a8d4",
                    },
                    {
                      label: "헤어",
                      value:
                        hairStyle && HAIR_STYLE_KEYS[hairStyle]
                          ? `${!NO_BANG_HAIR_STYLES.has(hairStyle) && hasBang ? "앞머리 있는 " : ""}${t(HAIR_STYLE_KEYS[hairStyle] as Parameters<typeof t>[0])}`
                          : "",
                      color: "#86efac",
                    },
                    {
                      label: "키",
                      value: bodyType ? `${heightCm}cm` : "",
                      color: "#7dd3fc",
                    },
                    {
                      label: "체형",
                      value: bodyType
                        ? t(`body_${bodyType}` as Parameters<typeof t>[0])
                        : "",
                      color: "#fde68a",
                    },
                  ].map(({ label, value, color }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-2"
                    >
                      <span
                        className="text-[13px] uppercase tracking-wider shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {label}
                      </span>
                      {value ? (
                        <span
                          className="text-sm font-bold truncate"
                          style={{ color }}
                        >
                          {value}
                        </span>
                      ) : (
                        <span
                          className="text-sm"
                          style={{ color: "var(--text-muted)" }}
                        >
                          —
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right — Step card (2/3 or full on step 1) */}
            <div
              className={`flex-1 min-w-0 flex min-h-0 ${wizardStep === 1 ? "items-center justify-center" : "items-stretch"}`}
            >
              <div
                className={`flex flex-col min-h-0 w-full ${wizardStep === 1 ? "max-w-lg" : "h-full"}`}
              >
                <div
                  className="rounded-2xl border overflow-hidden flex flex-col h-full"
                  style={{
                    background: "var(--surface-2)",
                    backdropFilter: "blur(32px)",
                    borderColor:
                      wizardStep === 1
                        ? "rgba(255,164,198,0.45)"
                        : "var(--border-subtle)",
                    boxShadow:
                      wizardStep === 1
                        ? "0 0 0 1px rgba(255,164,198,0.1), 0 0 60px rgba(255,120,90,0.18)"
                        : undefined,
                  }}
                >
                  {/* Step label */}
                  <div
                    className="border-b"
                    style={{
                      padding:
                        "clamp(10px, 2vh, 24px) clamp(14px, 2.5vw, 32px) clamp(8px, 1.5vh, 16px)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div
                      className="font-bold tracking-tight"
                      style={{
                        fontSize: "clamp(16px, 2vw, 24px)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {wizardStep === 1 && "성별 선택"}
                      {wizardStep === 2 && "바이브 선택"}
                      {wizardStep === 3 && "이름 & 외모"}
                      {wizardStep === 4 && "체형 설정"}
                      {wizardStep === 5 && t("stepPreview")}
                    </div>
                    <div
                      className="text-xs mt-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {wizardStep === 1 && "모델의 성별을 선택하세요"}
                      {wizardStep === 2 && "원하는 바이브를 골라보세요"}
                      {wizardStep === 3 &&
                        "이름과 얼굴형, 헤어스타일을 설정하세요"}
                      {wizardStep === 4 && "키와 체형을 설정하세요"}
                      {wizardStep === 5 && "마음에 드는 모델을 선택하세요"}
                    </div>
                  </div>

                  {/* ── STEP 1: Gender ── */}
                  {wizardStep === 1 && (
                    <div
                      className="flex-1 flex flex-col items-center justify-center gap-4"
                      style={{
                        padding:
                          "clamp(16px, 3vh, 40px) clamp(16px, 3vw, 40px)",
                      }}
                    >
                      <div className="flex gap-4">
                        {GENDER_VALUES.map((v) => {
                          const selected = gender === v;
                          const isFemale = v === "female";
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => {
                                setGender(v);
                                setHairStyle("");
                              }}
                              className="rounded-2xl text-base font-semibold transition-all flex flex-col items-center justify-center"
                              style={{
                                width: "clamp(100px, 14vw, 140px)",
                                height: "clamp(100px, 14vw, 140px)",
                                background: selected
                                  ? isFemale
                                    ? "rgba(255,164,198,0.12)"
                                    : "rgba(96,165,250,0.12)"
                                  : "var(--surface-2)",
                                border: selected
                                  ? isFemale
                                    ? "2px solid rgba(255,164,198,0.7)"
                                    : "2px solid rgba(96,165,250,0.7)"
                                  : "1.5px solid var(--border-default)",
                                color: selected
                                  ? isFemale
                                    ? "#ffa4c6"
                                    : "#93c5fd"
                                  : "var(--text-secondary)",
                                boxShadow: selected
                                  ? isFemale
                                    ? "0 4px 20px rgba(255,164,198,0.15)"
                                    : "0 4px 20px rgba(96,165,250,0.15)"
                                  : undefined,
                              }}
                            >
                              <div className="text-4xl mb-2">
                                {GENDER_ICONS[v]}
                              </div>
                              {t(
                                `gender${v.charAt(0).toUpperCase()}${v.slice(1)}` as Parameters<
                                  typeof t
                                >[0],
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── STEP 2: Style Vibe ── */}
                  {wizardStep === 2 && (
                    <div
                      className="flex-1 min-h-0 overflow-y-auto"
                      style={{
                        padding:
                          "clamp(12px, 2.5vh, 32px) clamp(12px, 2vw, 32px)",
                        background: "var(--surface-2)",
                      }}
                    >
                      <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-3">
                        {STYLE_VIBE_VALUES.map((v) => {
                          const vis = STYLE_VIBE_VISUALS[v];
                          const selected = styleVibe === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setStyleVibe(v)}
                              className={`relative rounded-2xl overflow-hidden transition-all duration-200 ${selected ? "scale-[1.03]" : "hover:scale-[1.02]"}`}
                              style={{
                                aspectRatio: "1/1",
                                border: selected
                                  ? "1px solid rgba(255,164,198,0.6)"
                                  : "1px solid var(--border-subtle)",
                                boxShadow: selected
                                  ? "0 4px 20px rgba(255,164,198,0.2)"
                                  : "none",
                              }}
                            >
                              {/* Background: image for asian_influencer / k_pop_idol / k_beauty_standard, gradient otherwise */}
                              {v === "asian_influencer" ? (
                                <img
                                  src="/persona_candidate_00680_.png"
                                  alt=""
                                  className="absolute inset-0 w-full h-full object-cover object-top"
                                />
                              ) : v === "k_pop_idol" ? (
                                <img
                                  src="/PhotoshopExtension_Image (12).png"
                                  alt=""
                                  className="absolute inset-0 w-full h-full object-cover object-top"
                                />
                              ) : v === "k_beauty_standard" ? (
                                <img
                                  src="/k-beauty-standard-card.png"
                                  alt=""
                                  className="absolute inset-0 w-full h-full object-cover object-top"
                                />
                              ) : (
                                <div
                                  className="absolute inset-0"
                                  style={{ background: vis.gradient }}
                                />
                              )}
                              {/* Dark overlay for unselected */}
                              {!selected && (
                                <div className="absolute inset-0 bg-black/30" />
                              )}
                              {/* Emoji (hidden for image-backed buttons) */}
                              {v !== "asian_influencer" &&
                                v !== "k_pop_idol" &&
                                v !== "k_beauty_standard" && (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                                    <span className="text-3xl drop-shadow-lg">
                                      {vis.emoji}
                                    </span>
                                  </div>
                                )}
                              {/* Label at bottom */}
                              <div
                                className="absolute bottom-0 left-0 right-0 px-2 py-2"
                                style={{
                                  background:
                                    "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
                                }}
                              >
                                <div className="text-[10px] font-semibold text-center leading-tight text-always-white">
                                  {t(
                                    STYLE_VIBE_KEYS[v] as Parameters<
                                      typeof t
                                    >[0],
                                  )}
                                </div>
                              </div>
                              {/* Free badge */}
                              {v === "asian_influencer" && (
                                <div
                                  className="absolute top-2.5 left-2.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold tracking-tight shadow-lg"
                                  style={{
                                    background:
                                      "linear-gradient(135deg,#ffa4c6,#ffe3be)",
                                    color: "#fff",
                                  }}
                                >
                                  인기
                                </div>
                              )}
                              {/* NanoBanana badge */}
                              {(v === "k_beauty_standard" ||
                                v === "k_pop_idol") && (
                                <div
                                  className="absolute top-2.5 left-2.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold tracking-tight shadow-lg"
                                  style={{
                                    background:
                                      "linear-gradient(135deg,#f59e0b,#fbbf24)",
                                    color: "#1a1a1a",
                                  }}
                                >
                                  NanoBanana
                                </div>
                              )}
                              {/* Selected checkmark */}
                              {selected && (
                                <div
                                  className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-lg"
                                  style={{ background: "#ffa4c6" }}
                                >
                                  ✓
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── STEP 3: Name + Age + Face + Hair ── */}
                  {wizardStep === 3 && (
                    <div
                      className="flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto"
                      style={{
                        padding:
                          "clamp(12px, 2.5vh, 32px) clamp(16px, 3vw, 40px)",
                        scrollbarWidth: "thin",
                        scrollbarColor: "rgba(255,164,198,0.2) transparent",
                      }}
                    >
                      <div>
                        <SectionLabel>{t("name")}</SectionLabel>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder={t("namePlaceholder")}
                          maxLength={50}
                          className="w-full rounded-xl px-4 py-2 text-sm placeholder:text-[color:var(--text-muted)] focus:outline-none"
                          style={{
                            color: "var(--text-primary)",
                            background: "var(--surface-2)",
                            border: "1px solid var(--border-subtle)",
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor =
                              "rgba(255,164,198,0.4)";
                            e.currentTarget.style.boxShadow =
                              "0 0 0 3px rgba(255,164,198,0.08)";
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor =
                              "var(--border-subtle)";
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        />
                        {name.trim().length > 0 && name.trim().length < 2 && (
                          <div className="text-xs text-red-400 mt-1">
                            최소 2글자 이상 입력하세요.
                          </div>
                        )}
                      </div>
                      <div>
                        <SectionLabel>{t("ageRange")}</SectionLabel>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {AGE_GROUP_VALUES.map((v) => (
                            <Chip
                              key={v}
                              selected={ageGroup === v}
                              onClick={() => setAgeGroup(v)}
                            >
                              {t(AGE_GROUP_KEYS[v] as Parameters<typeof t>[0])}
                            </Chip>
                          ))}
                        </div>
                      </div>
                      <div>
                        <SectionLabel>{t("faceType")}</SectionLabel>
                        <div
                          className="grid gap-1.5"
                          style={{
                            gridTemplateColumns: "repeat(14, minmax(0, 1fr))",
                          }}
                        >
                          {FACE_TYPE_VALUES.map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setFaceType(v)}
                              className="rounded-2xl text-center transition-all flex flex-col items-center justify-center gap-1"
                              style={{
                                aspectRatio: "1/1",
                                border:
                                  faceType === v
                                    ? "1px solid rgba(255,164,198,0.4)"
                                    : "1px solid var(--border-subtle)",
                                background:
                                  faceType === v
                                    ? "rgba(255,164,198,0.08)"
                                    : "var(--surface-2)",
                                boxShadow:
                                  faceType === v
                                    ? "0 4px 16px rgba(255,164,198,0.1)"
                                    : "none",
                              }}
                            >
                              <div className="text-2xl">
                                {FACE_TYPE_EMOJIS[v]}
                              </div>
                              <div
                                className="text-xs"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {t(
                                  FACE_TYPE_KEYS[v] as Parameters<typeof t>[0],
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <SectionLabel>피부톤</SectionLabel>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {SKIN_TONE_VALUES.map((v) => {
                            const selected = skinTone === v;
                            return (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setSkinTone(v)}
                                className="flex items-center gap-2 px-3 py-2 rounded-2xl text-sm font-medium transition-all"
                                style={
                                  selected
                                    ? {
                                        background: "rgba(255,164,198,0.08)",
                                        border:
                                          "1px solid rgba(255,164,198,0.4)",
                                        color: "#ffa4c6",
                                        boxShadow:
                                          "0 4px 16px rgba(255,164,198,0.1)",
                                      }
                                    : {
                                        background: "var(--surface-2)",
                                        border:
                                          "1px solid var(--border-subtle)",
                                        color: "var(--text-secondary)",
                                      }
                                }
                              >
                                <span
                                  className="w-4 h-4 rounded-full shrink-0"
                                  style={{
                                    background: SKIN_TONE_SWATCH[v],
                                    border: "1px solid var(--border-hover)",
                                  }}
                                />
                                {SKIN_TONE_LABELS[v]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <SectionLabel>얼굴형</SectionLabel>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {FACE_SHAPE_VALUES.map((v) => (
                            <Chip
                              key={v}
                              selected={faceShape === v}
                              onClick={() => setFaceShape(v)}
                            >
                              {FACE_SHAPE_LABELS[v]}
                            </Chip>
                          ))}
                        </div>
                      </div>
                      <div>
                        <SectionLabel>쌍커풀</SectionLabel>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {DOUBLE_EYELID_VALUES.map((v) => (
                            <Chip
                              key={v}
                              selected={doubleEyelid === v}
                              onClick={() => setDoubleEyelid(v)}
                            >
                              {DOUBLE_EYELID_LABELS[v]}
                            </Chip>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col flex-1 min-h-[200px]">
                        <div className="flex items-center justify-between mb-0.5">
                          <SectionLabel>{t("hairStyle")}</SectionLabel>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-[11px]"
                              style={{ color: "rgba(255,255,255,0.85)" }}
                            >
                              {t("bangLabel")}
                            </span>
                            {(["bangOn", "bangOff"] as const).map((key) => {
                              const isOn = key === "bangOn";
                              const disabled =
                                NO_BANG_HAIR_STYLES.has(hairStyle);
                              const selected = disabled
                                ? !isOn
                                : hasBang === isOn;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => setHasBang(isOn)}
                                  className="px-3 py-1 rounded-xl text-xs font-medium border transition-all duration-150"
                                  style={
                                    disabled
                                      ? {
                                          background: "var(--surface-2)",
                                          border:
                                            "1px solid var(--border-subtle)",
                                          color: "#52525b",
                                          cursor: "not-allowed",
                                        }
                                      : selected
                                        ? {
                                            background:
                                              "rgba(255,164,198,0.08)",
                                            border:
                                              "1px solid rgba(255,164,198,0.4)",
                                            color: "#ffa4c6",
                                          }
                                        : {
                                            background: "var(--surface-2)",
                                            border:
                                              "1px solid var(--border-subtle)",
                                            color: "var(--text-secondary)",
                                          }
                                  }
                                >
                                  {t(key)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div
                          className="overflow-y-auto flex-1 mt-1"
                          style={{
                            scrollbarWidth: "thin",
                            scrollbarColor: "rgba(255,164,198,0.2) transparent",
                          }}
                        >
                          <div className="grid grid-cols-10 gap-1">
                            {hairOptions.map((v) => {
                              const selected = hairStyle === v;
                              return (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => setHairStyle(v)}
                                  className="relative rounded-xl overflow-hidden transition-all duration-200 flex flex-col"
                                  style={{
                                    aspectRatio: "1/1",
                                    border: selected
                                      ? "1px solid rgba(255,164,198,0.4)"
                                      : "1px solid var(--border-subtle)",
                                    background: selected
                                      ? "rgba(255,164,198,0.08)"
                                      : "var(--surface-2)",
                                    boxShadow: selected
                                      ? "0 4px 16px rgba(255,164,198,0.1)"
                                      : "none",
                                  }}
                                >
                                  {/* Hair preview image */}
                                  <img
                                    src={`/hair/${gender === "male" ? "male" : "female"}_${v}.png`}
                                    alt={v}
                                    className="absolute inset-0 w-full h-full object-cover object-top"
                                    style={{
                                      opacity: selected ? 1 : 0.7,
                                    }}
                                  />
                                  {/* Label overlay at bottom */}
                                  <div
                                    className="absolute bottom-0 left-0 right-0 px-1 py-1 text-[11px] font-semibold text-center leading-tight"
                                    style={{
                                      background: "rgba(0,0,0,0.55)",
                                      color: selected ? "#ffa4c6" : "#fff",
                                    }}
                                  >
                                    {t(
                                      HAIR_STYLE_KEYS[v] as Parameters<
                                        typeof t
                                      >[0],
                                    )}
                                  </div>
                                  {selected && (
                                    <div
                                      className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[7px] font-bold shadow z-10"
                                      style={{ background: "#ffa4c6" }}
                                    >
                                      ✓
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── STEP 4: Height + Body ── */}
                  {wizardStep === 4 && (
                    <div
                      className="flex-1 flex flex-col justify-center space-y-6"
                      style={{
                        padding:
                          "clamp(12px, 2.5vh, 32px) clamp(16px, 3vw, 40px)",
                      }}
                    >
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <SectionLabel>{t("height")}</SectionLabel>
                          <span
                            className="text-xs font-mono"
                            style={{ color: "#ffa4c6" }}
                          >
                            {heightCm}cm
                          </span>
                        </div>
                        <>
                          <style>{`
                            .model-height-slider {
                              -webkit-appearance: none;
                              appearance: none;
                              height: 4px;
                              border-radius: 9999px;
                              background: var(--border-default);
                              outline: none;
                            }
                            .model-height-slider::-webkit-slider-thumb {
                              -webkit-appearance: none;
                              width: 16px;
                              height: 16px;
                              border-radius: 50%;
                              background: linear-gradient(135deg, #ffa4c6, #ffe3be);
                              cursor: pointer;
                              box-shadow: 0 2px 8px rgba(255,164,198,0.4);
                            }
                            .model-height-slider::-moz-range-thumb {
                              width: 16px;
                              height: 16px;
                              border: none;
                              border-radius: 50%;
                              background: linear-gradient(135deg, #ffa4c6, #ffe3be);
                              cursor: pointer;
                            }
                          `}</style>
                          <input
                            type="range"
                            min={150}
                            max={190}
                            step={1}
                            value={heightCm}
                            onChange={(e) =>
                              setHeightCm(Number(e.target.value))
                            }
                            className="model-height-slider w-full"
                          />
                        </>
                      </div>
                      <div>
                        <SectionLabel>{t("bodyType")}</SectionLabel>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {(gender === "female"
                            ? ["slim", "normal", "muscular", "chubby", "curvy"]
                            : [
                                "slim",
                                "normal",
                                "muscular",
                                "chubby",
                                "rugged",
                                "brawny",
                              ]
                          ).map((v) => (
                            <Chip
                              key={v}
                              selected={bodyType === v}
                              onClick={() => setBodyType(v)}
                            >
                              {t(`body_${v}` as Parameters<typeof t>[0])}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── STEP 5: Preview & Confirm ── */}
                  {wizardStep === 5 && (
                    <div
                      className="flex-1 flex flex-col min-h-0 gap-4"
                      style={{
                        padding:
                          "clamp(12px, 2vh, 24px) clamp(16px, 3vw, 40px)",
                      }}
                    >
                      {/* 4 candidates */}
                      {stage === "generating" && (
                        <div className="flex flex-col flex-1 min-h-0 gap-4">
                          <div className="flex-1 min-h-0 flex items-center justify-center relative">
                            {!generating && (
                              <button
                                type="button"
                                disabled={confirming}
                                onClick={handleGenerate}
                                className="absolute top-0 right-0 z-10 w-9 h-9 rounded-full flex items-center justify-center text-base transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                  background: "var(--surface-3)",
                                  border: "1px solid var(--border-hover)",
                                }}
                              >
                                ↺
                              </button>
                            )}
                            <div
                              className="grid grid-cols-2 gap-2"
                              style={{
                                aspectRatio: "1/1",
                                width: "min(100%, 50dvh)",
                              }}
                            >
                              {[0, 1, 2, 3].map((i) => {
                                const c = candidates[i];
                                const isSelected = !!(
                                  selectedCandidate && selectedCandidate === c
                                );
                                return (
                                  <div
                                    key={i}
                                    onClick={
                                      c
                                        ? () => setSelectedCandidate(c)
                                        : undefined
                                    }
                                    className="aspect-square rounded-xl overflow-hidden transition-all relative"
                                    style={{
                                      border: isSelected
                                        ? "2px solid rgba(255,164,198,0.6)"
                                        : c
                                          ? "2px solid var(--border-subtle)"
                                          : "2px solid var(--border-subtle)",
                                      boxShadow: isSelected
                                        ? "0 4px 20px rgba(255,164,198,0.2)"
                                        : "none",
                                      transform: isSelected
                                        ? "scale(1.02)"
                                        : undefined,
                                      cursor: c ? "pointer" : "default",
                                      background: "var(--surface-1)",
                                    }}
                                  >
                                    <div
                                      className="absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                      style={{
                                        background: isSelected
                                          ? "linear-gradient(135deg,#ffa4c6,#ffe3be)"
                                          : "rgba(0,0,0,0.6)",
                                        color: isSelected ? "#000" : "#aaa",
                                      }}
                                    >
                                      {["A", "B", "C", "D"][i]}
                                    </div>
                                    {isSelected && (
                                      <div
                                        className="absolute top-2.5 right-2.5 z-10 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                        style={{ background: "#ffa4c6" }}
                                      >
                                        ✓
                                      </div>
                                    )}
                                    {!c ? (
                                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                        <div
                                          className="absolute inset-0 animate-pulse"
                                          style={{
                                            background:
                                              "linear-gradient(135deg, rgba(255,164,198,0.04), rgba(255,227,190,0.06))",
                                          }}
                                        />
                                        <div className="relative z-10 w-8 h-8 rounded-full border-2 border-pink-400/40 border-t-pink-400 animate-spin" />
                                      </div>
                                    ) : (
                                      <img
                                        src={`data:image/png;base64,${c.image_b64}`}
                                        alt={`Candidate ${["A", "B", "C", "D"][i]}`}
                                        className="w-full h-full object-cover object-top select-none"
                                        draggable={false}
                                        onContextMenu={(e) =>
                                          e.preventDefault()
                                        }
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {generatingError && (
                            <div className="text-xs text-red-400 text-center shrink-0">
                              {generatingError}
                            </div>
                          )}
                          {jobError && (
                            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300 w-full">
                              {jobError}
                            </div>
                          )}
                          {confirming && (
                            <div
                              className="rounded-xl border border-pink-400/30 p-3 flex items-center gap-2 w-full"
                              style={{ background: "rgba(255,164,198,0.08)" }}
                            >
                              <div className="w-4 h-4 rounded-full border-2 border-pink-400 border-t-transparent animate-spin shrink-0" />
                              <div className="text-xs text-pink-200">
                                {t("saving")}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Navigation — inside card */}
                  {wizardStep <= 5 && (
                    <div
                      className="shrink-0 flex items-center justify-between border-t"
                      style={{
                        padding:
                          "clamp(8px, 1.5vh, 16px) clamp(14px, 2.5vw, 32px)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      {wizardStep > 1 ? (
                        <button
                          type="button"
                          disabled={
                            wizardStep === 5 && (generating || confirming)
                          }
                          onClick={() =>
                            setWizardStep((s) => (s - 1) as WizardStep)
                          }
                          className="flex items-center gap-2 px-8 py-3 rounded-full text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{
                            background: "var(--surface-2)",
                            border: "1px solid var(--border-subtle)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {t("prev")}
                        </button>
                      ) : (
                        <div />
                      )}

                      {wizardStep < 4 && (
                        <button
                          type="button"
                          disabled={
                            (wizardStep === 1 && !canStep1Next) ||
                            (wizardStep === 2 && !canStep2Next) ||
                            (wizardStep === 3 && !canStep3Next)
                          }
                          onClick={() =>
                            setWizardStep((s) => (s + 1) as WizardStep)
                          }
                          className="flex items-center gap-3 px-8 py-3 rounded-full text-sm font-bold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{
                            background:
                              "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                            color: "#000",
                            boxShadow: "0 4px 24px rgba(255,164,198,0.35)",
                          }}
                        >
                          {t("next")} ›
                        </button>
                      )}
                      {wizardStep === 4 && (
                        <button
                          type="button"
                          disabled={!canStep4Next}
                          onClick={() => {
                            if (!user) {
                              setShowLoginGate(true);
                            } else {
                              setWizardStep(5);
                            }
                          }}
                          className="flex items-center gap-3 px-8 py-3 rounded-full text-sm font-bold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{
                            background:
                              "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                            color: "#000",
                            boxShadow: "0 4px 24px rgba(255,164,198,0.35)",
                          }}
                        >
                          생성 ›
                        </button>
                      )}
                      {wizardStep === 5 && (
                        <button
                          type="button"
                          disabled={
                            generating ||
                            !selectedCandidate ||
                            confirming ||
                            name.trim().length < 2
                          }
                          onClick={() => setShowConfirm(true)}
                          className="flex items-center gap-3 px-8 py-3 rounded-full text-sm font-bold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{
                            background:
                              "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                            color: "#000",
                            boxShadow: "0 4px 24px rgba(255,164,198,0.35)",
                          }}
                        >
                          {confirming ? t("saving") : t("confirmCreate")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default function ModelCreatePage() {
  return (
    <Suspense>
      <ModelCreateContent />
    </Suspense>
  );
}

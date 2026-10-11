/**
 * backgroundMotionPresets.ts — motion preset → FFmpeg filter string 매핑
 *
 * 모션은 매우 약해야 한다. loop 제작이 쉬워야 한다.
 * zoompan 필터: z=zoom, x/y=center 오프셋, d=frame 수, s=출력 해상도
 */

import type { MotionPreset } from "@/lib/background/backgroundVideo.types";

export interface MotionPresetDef {
  /** FFmpeg -vf 값 (width/height/fps 치환 필요) */
  buildVf: (width: number, height: number, fps: number, durationSec: number) => string;
  /** loop composer에게 힌트 — 이 preset은 ping-pong이 매끄러운지 */
  pingPongFriendly: boolean;
  description: string;
}

const SCALE_FACTOR = 1.12; // 줌아웃 룸 (12% 더 크게 스케일)

export const MOTION_PRESET_DEFS: Record<MotionPreset, MotionPresetDef> = {
  slow_pan_right: {
    buildVf: (w, h, fps, dur) => {
      const frames = Math.ceil(fps * dur);
      const scaledW = Math.ceil(w * SCALE_FACTOR);
      const scaledH = Math.ceil(h * SCALE_FACTOR);
      // x 좌표를 천천히 오른쪽으로 이동 (이미지는 왼→오)
      return `scale=${scaledW}:${scaledH},zoompan=z=${SCALE_FACTOR}:x='(iw-(iw/zoom))/2+t*2':y='(ih-(ih/zoom))/2':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },
    pingPongFriendly: true,
    description: "천천히 오른쪽 pan — 가장 안정적인 기본 경로",
  },
  slow_pan_left: {
    buildVf: (w, h, fps, dur) => {
      const frames = Math.ceil(fps * dur);
      const scaledW = Math.ceil(w * SCALE_FACTOR);
      const scaledH = Math.ceil(h * SCALE_FACTOR);
      return `scale=${scaledW}:${scaledH},zoompan=z=${SCALE_FACTOR}:x='(iw-(iw/zoom))/2-t*2':y='(ih-(ih/zoom))/2':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },
    pingPongFriendly: true,
    description: "천천히 왼쪽 pan",
  },
  subtle_push_in: {
    buildVf: (w, h, fps, dur) => {
      const frames = Math.ceil(fps * dur);
      const maxZ = SCALE_FACTOR;
      return `zoompan=z='min(zoom+0.0008,${maxZ})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },
    pingPongFriendly: true,
    description: "매우 미세한 push in (zoom in)",
  },
  subtle_pull_out: {
    buildVf: (w, h, fps, dur) => {
      const frames = Math.ceil(fps * dur);
      return `zoompan=z='max(zoom-0.0008,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },
    pingPongFriendly: true,
    description: "매우 미세한 pull out (zoom out)",
  },
  micro_parallax_drift: {
    buildVf: (w, h, fps, dur) => {
      const frames = Math.ceil(fps * dur);
      const scaledW = Math.ceil(w * SCALE_FACTOR);
      const scaledH = Math.ceil(h * SCALE_FACTOR);
      // 아주 작은 진폭의 수평 + 수직 drift (sin 불가 → 선형 근사)
      return `scale=${scaledW}:${scaledH},zoompan=z=${SCALE_FACTOR}:x='(iw-(iw/zoom))/2+sin(t*0.5)*4':y='(ih-(ih/zoom))/2+cos(t*0.3)*2':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },
    pingPongFriendly: false,
    description: "미세한 복합 드리프트",
  },
};

export function getMotionPresetDef(preset: string): MotionPresetDef | null {
  return MOTION_PRESET_DEFS[preset as MotionPreset] ?? null;
}

export const ALLOWED_MOTION_PRESETS = new Set<string>(Object.keys(MOTION_PRESET_DEFS));

"use client";

import { useEffect, useRef } from "react";

export function LandingVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;

    let recovering = false;
    let lastCurrentTime = 0;
    let lastTickAt = 0;

    // play() 호출 후 450ms 내 currentTime이 진행하지 않으면 v.load()로 강제 재초기화
    const tryPlay = async (allowReload = true): Promise<void> => {
      if (v.ended) return;
      if (document.hidden) return;
      try {
        await v.play();
      } catch (err) {
        const name = (err as Error).name;
        if (name !== "NotAllowedError" && name !== "AbortError") return;
      }
      if (!allowReload) return;
      const startedTime = v.currentTime;
      window.setTimeout(() => {
        if (document.hidden || v.ended || recovering) return;
        const advanced = v.currentTime - startedTime > 0.05;
        if (!advanced) {
          recovering = true;
          v.load();
          v.addEventListener(
            "canplay",
            () => {
              recovering = false;
              void tryPlay(false);
            },
            { once: true },
          );
          v.addEventListener(
            "error",
            () => {
              recovering = false;
            },
            { once: true },
          );
        }
      }, 450);
    };

    void tryPlay();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void tryPlay();
    };
    const onPageShow = () => {
      void tryPlay();
    };
    const onFocus = () => {
      void tryPlay();
    };
    // capture phase로 부착 — 스크롤 컨테이너가 window가 아니어도 잡힘
    const onScroll = () => {
      if (v.paused) void tryPlay();
    };
    const onPause = () => {
      if (!document.hidden) void tryPlay();
    };
    const onStalled = () => {
      void tryPlay();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    v.addEventListener("pause", onPause);
    v.addEventListener("stalled", onStalled);

    // rAF healthcheck: background tab에서 throttling 없이, visible 전이 직후 즉시 실행
    let rafId = 0;
    const tick = (now: number) => {
      if (now - lastTickAt > 800) {
        lastTickAt = now;
        if (!document.hidden && v.paused && !v.ended) {
          void tryPlay();
        }
        // paused=false인데 currentTime이 안 늘어나는 silent failure 감지
        if (!document.hidden && !v.paused && !v.ended && !recovering) {
          if (v.currentTime === lastCurrentTime) {
            recovering = true;
            v.load();
            v.addEventListener(
              "canplay",
              () => {
                recovering = false;
                void tryPlay(false);
              },
              { once: true },
            );
            v.addEventListener(
              "error",
              () => {
                recovering = false;
              },
              { once: true },
            );
          }
          lastCurrentTime = v.currentTime;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("scroll", onScroll, {
        capture: true,
      } as EventListenerOptions);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("stalled", onStalled);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src="/landing.mp4"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      onClick={() => {
        const v = videoRef.current;
        if (v && v.paused) void v.play().catch(() => {});
      }}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "center",
        zIndex: 0,
      }}
    />
  );
}

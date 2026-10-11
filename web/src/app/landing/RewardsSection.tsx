"use client";

import { useTranslations } from "next-intl";
import { FadeInOnScroll } from "./FadeInOnScroll";

export function RewardsSection() {
  const t = useTranslations("landing");
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <FadeInOnScroll>
          <div className="card card-glass relative overflow-hidden px-8 py-14 sm:px-16" style={{ borderRadius: "1.5rem" }}>
            <div className="bg-glow-pink pointer-events-none" style={{ width: 240, height: 240, top: -80, right: -80, background: "rgba(255,164,198,0.10)", filter: "blur(80px)" }} />

            <div className="relative flex flex-col items-center text-center sm:items-start sm:text-left">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl text-pink-400" style={{ background: "var(--accent-subtle)" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>

              <h2 className="heading-section text-white">{t("workflowTitle")}</h2>
              <p className="mt-3 max-w-xl text-zinc-400">
                {t("workflowDesc1")}
                <br />
                {t("workflowDesc2")}
              </p>

              <ul className="mt-6 space-y-2.5 text-left">
                {(["workflowBullet1", "workflowBullet2", "workflowBullet3"] as const).map((key) => (
                  <li key={key} className="flex items-center gap-3 text-sm text-zinc-300">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-pink-400 shrink-0">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {t(key)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </FadeInOnScroll>
      </div>
    </section>
  );
}

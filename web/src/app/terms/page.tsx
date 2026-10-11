"use client";

import { SiteHeader } from "@/components/SiteHeader";
import { TermsContent } from "@/components/TermsContent";
import { useLocaleSettings } from "@/components/LocaleProvider";

export default function TermsPage() {
  const { uiLanguage } = useLocaleSettings();
  return (
    <div className="h-dvh overflow-x-hidden overflow-y-auto relative text-zinc-100 lg-pl-sidebar">
      <SiteHeader />
      <main className="pt-11 lg:pt-0 max-w-3xl mx-auto px-6 py-10">
        <TermsContent
          initialLocale={uiLanguage === "ko" ? "ko" : "en"}
          showLanguageToggle={true}
        />
      </main>
    </div>
  );
}

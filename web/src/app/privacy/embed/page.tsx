"use client";

import { PrivacyContent } from "@/components/PrivacyContent";

export default function PrivacyEmbedPage() {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 px-6 py-3">
      <div className="max-w-3xl mx-auto">
        <PrivacyContent initialLocale="en" showLanguageToggle={false} />
      </div>
    </div>
  );
}

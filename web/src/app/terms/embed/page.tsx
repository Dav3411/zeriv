"use client";

import { TermsContent } from "@/components/TermsContent";

export default function TermsEmbedPage() {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 px-6 py-3">
      <div className="max-w-3xl mx-auto">
        <TermsContent initialLocale="en" showLanguageToggle={false} />
      </div>
    </div>
  );
}

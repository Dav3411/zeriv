import { LandingNav } from "./landing/LandingNav";
import { HeroSection } from "./landing/HeroSection";
import { PainSection } from "./landing/PainSection";
import { FeatureSections } from "./landing/FeatureSections";
import { ModelShowcase } from "./landing/PersonaShowcase";
import { HowItWorksSection } from "./landing/HowItWorksSection";
import { PricingSection } from "./landing/PricingSection";
import { FooterSection } from "./landing/FooterSection";

export default function LandingPage() {
  return (
    <div className="landing-dark">
      <div className="min-h-screen overflow-x-clip text-zinc-100">
        <LandingNav />
        <HeroSection />
        <div
          id="overview"
          className="relative"
          style={{ background: "var(--surface-0)", zIndex: 20 }}
        >
          <ModelShowcase />
          <PainSection />
          <HowItWorksSection />
          <FeatureSections />
          <PricingSection />
          <FooterSection />
        </div>
      </div>
    </div>
  );
}

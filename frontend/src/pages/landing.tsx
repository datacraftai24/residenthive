import { LandingNav } from "@/components/landing/LandingNav";
import { HeroSection } from "@/components/landing/HeroSection";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { SolutionSection } from "@/components/landing/SolutionSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { DifferentiatorsSection } from "@/components/landing/DifferentiatorsSection";
import { SocialProofSection } from "@/components/landing/SocialProofSection";
import { CTASection } from "@/components/landing/CTASection";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <LandingNav />
      <main>
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <HowItWorksSection />
        <DifferentiatorsSection />
        <SocialProofSection />
        <CTASection />
      </main>
      <LandingFooter />
    </div>
  );
}

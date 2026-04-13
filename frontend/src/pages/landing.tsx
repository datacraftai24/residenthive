import { LandingNav } from "@/components/landing/LandingNav";
import { HeroSection } from "@/components/landing/HeroSection";
import { NumbersBar } from "@/components/landing/NumbersBar";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { SmartResponseSection } from "@/components/landing/SmartResponseSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { DemoSection } from "@/components/landing/DemoSection";
import { ChannelsSection } from "@/components/landing/ChannelsSection";
import { MarketsSection } from "@/components/landing/MarketsSection";
import { DifferentiatorsSection } from "@/components/landing/DifferentiatorsSection";
import { SocialProofSection } from "@/components/landing/SocialProofSection";
import { CTASection } from "@/components/landing/CTASection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { SEO } from "@/components/SEO";

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="ResidenceHive | AI-Powered Workflows for Real Estate Agents"
        description="From first lead response to draft-ready offers — built around how agents actually work in each market."
        canonical="https://residencehive.com/"
      />
      <LandingNav />
      <main>
        <HeroSection />
        <NumbersBar />
        <ProblemSection />
        <SmartResponseSection />
        <HowItWorksSection />
        <DemoSection />
        <ChannelsSection />
        <MarketsSection />
        <DifferentiatorsSection />
        <SocialProofSection />
        <CTASection />
      </main>
      <LandingFooter />
    </div>
  );
}

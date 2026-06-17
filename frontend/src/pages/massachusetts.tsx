import { LandingNav } from "@/components/landing/LandingNav";
import { MarketHero } from "@/components/landing/MarketHero";
import { MarketCTA } from "@/components/landing/MarketCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { SEO } from "@/components/SEO";
import { Check, Shield, Eye, Building2 } from "lucide-react";

function ProblemStats() {
  const stats = [
    "78% of leads never get a personalized response",
    "The ones that do still get 30+ unranked listings with no context",
    "By the time an agent follows up, the buyer is already on Zillow's ChatGPT",
  ];
  return (
    <section className="py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-[#111827] mb-4 text-center">
          Massachusetts agents lose leads before they start
        </h2>
        <p className="text-[#6b7280] text-lg mb-8 text-center max-w-2xl mx-auto">
          You pay $100–225+ per lead. Most get a generic listing dump and disappear. The buyer had real intent — budget, timeline, preferences — and none of it was captured.
        </p>
        <div className="grid sm:grid-cols-3 gap-6">
          {stats.map((s) => (
            <div key={s} className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 text-center">
              <p className="text-sm text-[#111827]">{s}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MAHowItWorks() {
  const steps = [
    { n: "1", title: "Lead arrives", desc: "website, Zillow, Realtor.com, referral — any source" },
    { n: "2", title: "AI builds a buyer profile", desc: "budget, timeline, must-haves, dealbreakers extracted. No forms." },
    { n: "3", title: "Curated buyer report", desc: "Top 5 listings ranked and explained. Why each one fits. What the trade-offs are. Pulled from MLS PIN data." },
    { n: "4", title: "Buyer engages on their schedule", desc: "AI chatbot answers questions within brokerage-controlled parameters. Compliance guardrails handle Fair Housing, steering risk, and school data." },
    { n: "5", title: "Agent gets a qualified lead", desc: "full context: preferences, concerns, engagement history, risk flags. Ready for a real conversation." },
  ];
  return (
    <section className="py-20 bg-[#f8faf9]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-[#111827] mb-10 text-center">
          From lead to qualified buyer — in minutes, not days
        </h2>
        <div className="space-y-6">
          {steps.map((s) => (
            <div key={s.n} className="flex gap-4">
              <span className="font-mono font-bold text-teal-600 text-lg w-6 shrink-0">{s.n}</span>
              <div>
                <span className="font-semibold text-[#111827]">{s.title}</span>
                <span className="text-[#6b7280]"> — {s.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComplianceSection() {
  const features = [
    { icon: Shield, title: "6-tier compliance framework", desc: "from full comparison (Tier 1) to hard-freeze on demographics (Tier 5) to school data with names and distances but no ratings (Tier 6)" },
    { icon: Eye, title: "Two-LLM architecture", desc: "one model generates, a second rewrites for compliance. Post-hook rewriters catch what prompts can't." },
    { icon: Check, title: "Agent-only risk flags", desc: "visual concerns and sensitive topics go to the agent dashboard, not the buyer" },
    { icon: Building2, title: "Brokerage control", desc: "your brokerage sets the parameters. The AI operates within them." },
  ];
  return (
    <section className="py-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-[#111827] mb-4 text-center">
          Compliance isn't a feature. It's the architecture.
        </h2>
        <p className="text-[#6b7280] text-lg mb-10 text-center max-w-3xl mx-auto">
          Massachusetts has 14+ Fair Housing protected classes, 254 CMR 3.00, M.G.L. c. 93A, and the NAR August 2024 settlement rules. Generic AI doesn't know any of this. ResidenceHive does.
        </p>
        <div className="grid sm:grid-cols-2 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-7">
              <f.icon className="h-6 w-6 text-teal-600 mb-3" />
              <h3 className="font-semibold text-[#111827] mb-2">{f.title}</h3>
              <p className="text-sm text-[#6b7280]">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function MassachusettsPage() {
  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="AI-Powered Buyer Engagement for Massachusetts Real Estate Agents | ResidenceHive"
        description="ResidenceHive turns raw leads into qualified buyers — with MLS PIN data, Fair Housing compliance, and agent-controlled AI built for how MA transactions work."
        canonical="https://residencehive.com/massachusetts"
      />
      <LandingNav />
      <main>
        <MarketHero
          headline="AI-powered buyer engagement for Massachusetts agents"
          subhead="ResidenceHive turns raw leads into qualified buyers — with MLS PIN data, Fair Housing compliance, and agent-controlled AI built for how MA transactions work."
        />
        <ProblemStats />
        <MAHowItWorks />
        <ComplianceSection />
        <MarketCTA
          headline="Join the Massachusetts pilot"
          subtext="60-day free pilot. MLS PIN data. No long-term contracts."
        />
      </main>
      <LandingFooter />
    </div>
  );
}

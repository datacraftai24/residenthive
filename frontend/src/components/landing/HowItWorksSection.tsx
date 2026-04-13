import { StepsCard } from "./StepsCard";

const leadSteps = [
  { number: "01", title: "Lead arrives", description: "From your website, Zillow, Realtor.com, or a referral" },
  { number: "02", title: "AI analyzes", description: "Extracts budget, timeline, must-haves, dealbreakers" },
  { number: "03", title: "Report generated", description: "Curated Top-5 listings with personalized explanations" },
  { number: "04", title: "Buyer engages", description: "Chatbot answers questions within compliance guardrails" },
  { number: "05", title: "Agent acts", description: "Qualified lead with full context — ready for action" },
];

const offerSteps = [
  { number: "01", title: "Agent sends deal details", description: "Natural language via WhatsApp — no forms" },
  { number: "02", title: "System extracts", description: "Price, conditions, dates, parties, clauses" },
  { number: "03", title: "Missing fields flagged", description: "AI asks for what's incomplete" },
  { number: "04", title: "Draft package generated", description: "Pre-filled forms ready for agent review" },
  { number: "05", title: "Agent reviews and sends", description: "Nothing goes out without agent approval" },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#111827] mb-4">
            Two products. One platform.
          </h2>
          <p className="text-[#6b7280] text-lg">
            Both built for compliance-first real estate.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          <StepsCard
            label="Lead Engagement"
            subtitle="Turn raw leads into qualified buyers with AI-powered first response."
            steps={leadSteps}
            accentColor="teal"
          />
          <StepsCard
            label="Offer Bot"
            subtitle="Go from a listing address to a draft-ready offer package in minutes."
            steps={offerSteps}
            accentColor="blue"
          />
        </div>
      </div>
    </section>
  );
}

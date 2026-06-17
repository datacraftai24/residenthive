import { LandingNav } from "@/components/landing/LandingNav";
import { MarketHero } from "@/components/landing/MarketHero";
import { MarketCTA } from "@/components/landing/MarketCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { SEO } from "@/components/SEO";
import { ArrowRight, Check } from "lucide-react";

function HowOfferBotWorks() {
  const steps = [
    { n: "1", title: "Share the deal", desc: "send a listing link or property address, buyer info, and conditions via WhatsApp. Natural language, no forms." },
    { n: "2", title: "AI extracts and asks", desc: "property details are pulled automatically. Missing fields are flagged — the bot asks for what's incomplete." },
    { n: "3", title: "Draft forms generated", desc: "market-specific forms pre-filled and ready for review" },
    { n: "4", title: "Agent reviews and sends", desc: "nothing goes out without agent sign-off" },
  ];
  return (
    <section className="py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-[#111827] mb-10 text-center">How Offer Bot works</h2>
        <div className="space-y-6 mb-8">
          {steps.map((s) => (
            <div key={s.n} className="flex gap-4">
              <span className="font-mono font-bold text-blue-500 text-lg w-6 shrink-0">{s.n}</span>
              <div>
                <span className="font-semibold text-[#111827]">{s.title}</span>
                <span className="text-[#6b7280]"> — {s.desc}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-[#6b7280] italic text-center">
          Draft preparation, not legal advice. The agent owns every transaction.
        </p>
      </div>
    </section>
  );
}

function MarketColumns() {
  const markets = [
    {
      title: "Massachusetts",
      features: [
        "MLS PIN data integration",
        "MA Purchase and Sale Agreement",
        "Local addenda and forms",
        "Fair Housing compliance guardrails",
      ],
      link: "/massachusetts",
      linkText: "See Massachusetts details",
    },
    {
      title: "Ontario",
      features: [
        "Listing-aware autofill from address or listing link",
        "OREA Form 100 (APS), Form 801, Form 320",
        "Ontario Human Rights Code compliance",
        "Multilingual: Urdu, Hindi, Arabic",
      ],
      link: "/ontario",
      linkText: "See Ontario details",
    },
  ];
  return (
    <section className="py-20 bg-[#f8faf9]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-[#111827] mb-10 text-center">Localized for each market</h2>
        <div className="grid md:grid-cols-2 gap-8">
          {markets.map((m) => (
            <div key={m.title} className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-7 sm:p-8">
              <h3 className="text-xl font-bold text-[#111827] mb-4">{m.title}</h3>
              <div className="space-y-2 mb-6">
                {m.features.map((f) => (
                  <div key={f} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                    <span className="text-sm text-[#111827]">{f}</span>
                  </div>
                ))}
              </div>
              <a href={m.link} className="text-teal-600 font-medium text-sm hover:text-teal-700 flex items-center gap-1">
                {m.linkText} <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function OfferBotPage() {
  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="Offer Bot — From Listing Address to Draft-Ready Offer | ResidenceHive"
        description="Drop a listing link or property address into WhatsApp. ResidenceHive pulls the property details, pre-fills your forms, and delivers a draft package for your review."
        canonical="https://residencehive.com/offer-bot"
      />
      <LandingNav />
      <main>
        <MarketHero
          headline="From listing address to draft-ready offer"
          subhead="Drop a listing link or property address into WhatsApp. ResidenceHive pulls the property details, pre-fills your forms, and delivers a draft package for your review."
        />
        <HowOfferBotWorks />
        <MarketColumns />
        <MarketCTA
          headline="Try Offer Bot in your market"
          subtext="60-day free pilot. WhatsApp-native. Works with your existing workflow."
        />
      </main>
      <LandingFooter />
    </div>
  );
}

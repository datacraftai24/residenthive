import { LandingNav } from "@/components/landing/LandingNav";
import { MarketHero } from "@/components/landing/MarketHero";
import { MarketCTA } from "@/components/landing/MarketCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { SEO } from "@/components/SEO";
import { Mic, FileText, Shield, Globe, MessageCircle, Check } from "lucide-react";

function OntarioProblem() {
  return (
    <section className="py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl font-bold text-[#111827] mb-4">
          Ontario agents juggle too many manual steps
        </h2>
        <p className="text-[#6b7280] text-lg mb-6 max-w-3xl mx-auto">
          A lead comes in from an open house, a WhatsApp message, a restaurant conversation. The agent has intent — but no system to capture it before it's lost. When the deal moves forward, offer prep is manual: pulling up blank OREA forms, retyping property data, double-checking clause numbers, hoping nothing is missed before the agent reviews.
        </p>
        <p className="text-teal-600 font-semibold">Two problems. One platform.</p>
      </div>
    </section>
  );
}

function BuyerEngagement() {
  const features = [
    { icon: Mic, title: "Voice note to buyer profile", desc: "send a 30-second WhatsApp voice note after a conversation, ResidenceHive extracts the buyer's preferences automatically" },
    { icon: FileText, title: "AI-powered buyer report", desc: "curated listings matched to buyer preferences" },
    { icon: Shield, title: "Compliant chatbot", desc: "handles buyer questions within Ontario Human Rights Code guardrails" },
    { icon: Check, title: "Agent approval", desc: "nothing reaches the buyer without the agent's sign-off" },
  ];
  return (
    <section className="py-20 bg-[#f8faf9]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-[#111827] mb-4 text-center">Capture leads before they disappear</h2>
        <p className="text-[#6b7280] text-lg mb-10 text-center max-w-2xl mx-auto">
          The open house walk-through. The WhatsApp voice note. The referral from a friend. These leads have real intent — but they never make it into your CRM.
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

function OfferBot() {
  const steps = [
    { n: "1", title: "Message your deal", desc: "send a listing link or property address plus buyer info and conditions via WhatsApp. Natural language, no forms." },
    { n: "2", title: "AI extracts and asks", desc: "system pulls property details (price, beds, baths, lot size, listing info) and flags anything missing" },
    { n: "3", title: "Draft package generated", desc: "pre-filled OREA forms: Form 100 (Agreement of Purchase and Sale), Form 801, Form 320 (Co-operating Commission)" },
    { n: "4", title: "Agent reviews", desc: "nothing goes to DocuSign without agent review and approval" },
  ];
  return (
    <section className="py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-[#111827] mb-10 text-center">
          Share the address. We handle the rest.
        </h2>
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
          This is draft preparation, not legal advice. The agent reviews everything. ResidenceHive accelerates the prep — the agent owns the transaction.
        </p>
      </div>
    </section>
  );
}

function WhyOntario() {
  const features = [
    { icon: FileText, title: "OREA forms", desc: "not generic templates. Form 100, Form 801, Form 320, with the right clause structure" },
    { icon: Check, title: "Listing-aware autofill", desc: "share the address or listing link, we pull the property details and pre-fill your forms" },
    { icon: Shield, title: "Ontario Human Rights Code compliance", desc: "more protected classes than most US states, built into the AI from day one" },
    { icon: Globe, title: "Multilingual", desc: "supports Urdu, Hindi, Arabic, and more. 400K+ Urdu speakers in the GTA alone" },
    { icon: MessageCircle, title: "WhatsApp-native", desc: "because that's how Ontario agents actually communicate with clients" },
  ];
  return (
    <section className="py-20 bg-[#f8faf9]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-[#111827] mb-10 text-center">
          Built for Ontario — not adapted from somewhere else
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
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

export default function OntarioPage() {
  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="AI-Powered Workflows for Ontario Real Estate Agents | ResidenceHive"
        description="From buyer engagement to draft-ready OREA offer packages — built for how Ontario agents actually work."
        canonical="https://residencehive.com/ontario"
      />
      <LandingNav />
      <main>
        <MarketHero
          headline="AI-powered workflows for Ontario real estate agents"
          subhead="From buyer engagement to draft-ready OREA offer packages — built for how Ontario agents actually work."
        />
        <OntarioProblem />
        <BuyerEngagement />
        <OfferBot />
        <WhyOntario />
        <MarketCTA
          headline="Join the Ontario pilot"
          subtext="60-day free pilot. WhatsApp-native. No long-term contracts."
        />
      </main>
      <LandingFooter />
    </div>
  );
}

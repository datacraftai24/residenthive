import { Link } from "wouter";
import { Button } from "@/components/ui/button";

function TodayCard() {
  return (
    <div className="bg-white border border-[#fecaca] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-7 opacity-[0.85] relative">
      <span className="absolute top-3 right-3 sm:top-4 sm:right-4 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-semibold uppercase bg-[#fef2f2] text-red-600">
        Today
      </span>
      <p className="text-[#9ca3af] text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-2 sm:mb-3">
        What your leads get now
      </p>
      {/* Fake email mockup */}
      <div className="bg-[#f9fafb] border border-[#e5e7eb] rounded-lg p-3 sm:p-4 text-xs sm:text-sm space-y-1 sm:space-y-1.5 mb-4 sm:mb-5">
        <p className="text-[#6b7280]"><span className="font-medium text-[#111827]">From:</span> agent@brokerage.com</p>
        <p className="text-[#6b7280]"><span className="font-medium text-[#111827]">Subject:</span> Here are some listings for you!</p>
        <div className="border-t border-[#e5e7eb] pt-2 mt-2 space-y-1">
          <p className="text-[#6b7280]">123 Main St — $850K — 3bd/2ba</p>
          <p className="text-[#6b7280]">456 Oak Ave — $920K — 4bd/2ba</p>
          <p className="text-[#6b7280]">789 Elm Dr — $780K — 3bd/1ba</p>
          <p className="text-[#6b7280]">321 Pine Rd — $1.1M — 4bd/3ba</p>
          <p className="text-[#9ca3af] italic text-xs">... and 26 more listings</p>
        </div>
      </div>
      <div className="text-center">
        <span className="text-2xl">🗑️</span>
        <p className="text-red-500 font-bold text-sm mt-1">Buyer never opens it</p>
        <p className="text-[#9ca3af] text-xs">$200 lead — gone</p>
      </div>
    </div>
  );
}

function WithRHCard() {
  const listings = [
    { rank: "#1", address: "60 Lindbergh Ave, Newton", reason: "Best school match + under budget" },
    { rank: "#2", address: "14 Oak Hill Rd, Newton", reason: "Larger lot, needs some updating" },
    { rank: "#3", address: "88 Crafts St, Newtonville", reason: "Walk to village, above budget by 5%" },
  ];

  return (
    <div className="bg-white border-2 border-teal-600 rounded-[14px] shadow-[0_0_20px_rgba(13,148,136,0.12)] p-4 sm:p-7 relative">
      <span className="absolute top-3 right-3 sm:top-4 sm:right-4 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-semibold uppercase bg-[#f0fdfa] text-teal-700">
        ResidenceHive
      </span>
      <p className="text-teal-700 text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-2 sm:mb-3">
        What your leads get instead
      </p>
      {/* Buyer report mockup */}
      <div className="bg-[#f0fdfa] border border-[#99f6e8] rounded-lg p-4 mb-5">
        <p className="font-semibold text-[#111827] text-sm mb-1">Personalized Buyer Report for Michael</p>
        <p className="text-teal-700 text-xs font-bold mb-3">Top 5 picks — ranked for you</p>
        <div className="space-y-2.5">
          {listings.map((l) => (
            <div key={l.rank} className="flex items-start gap-2.5">
              <span className="bg-white text-teal-700 text-xs font-bold px-2 py-0.5 rounded shrink-0 border border-[#99f6e8]">
                {l.rank}
              </span>
              <div>
                <p className="text-sm font-medium text-[#111827]">{l.address}</p>
                <p className="text-xs text-[#6b7280]">{l.reason}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-center">
        <span className="text-2xl">💬</span>
        <p className="text-teal-600 font-bold text-sm mt-1">Buyer engages instantly</p>
        <p className="text-[#9ca3af] text-xs">Asks about schools, schedules showing</p>
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="pt-28 pb-16 bg-gradient-to-b from-[#f0fdfa] to-white overflow-hidden">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 overflow-hidden">
        {/* Badge */}
        <div className="text-center mb-6">
          <span className="inline-block px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium text-teal-700 bg-[#f0fdfa] border border-[#99f6e8]">
            Now in Private Pilot — Massachusetts &amp; Ontario
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-lg sm:text-4xl lg:text-[44px] font-bold text-[#111827] leading-snug text-center mb-6 sm:mb-10">
          Which one would <span className="text-teal-600">your buyer</span> respond to?
        </h1>

        {/* Before/After Cards */}
        <div className="grid md:grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-10">
          <TodayCard />
          <WithRHCard />
        </div>

        {/* Bottom text + CTA */}
        <div className="text-center">
          <p className="text-[#6b7280] text-base mb-6">
            AI handles the first response and offer prep. <span className="font-bold text-[#111827]">Your agents handle the relationship.</span>
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
            <button
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center justify-center rounded-md bg-teal-600 hover:bg-teal-700 text-white shadow-lg px-8 py-3 text-base font-medium transition-colors"
            >
              See How It Works
            </button>
            <button
              onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center justify-center text-teal-600 hover:text-teal-700 font-medium text-base transition-colors"
            >
              Watch the demo →
            </button>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { emoji: "🎯", text: "60-day free pilot" },
              { emoji: "✅", text: "No contracts" },
              { emoji: "💬", text: "WhatsApp + iMessage" },
            ].map((pill) => (
              <span key={pill.text} className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-[#e5e7eb] rounded-full text-sm font-semibold text-[#111827]">
                {pill.emoji} {pill.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

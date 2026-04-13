import { Home, Zap, X } from "lucide-react";

function ProblemCard({
  icon,
  label,
  costNumber,
  costSuffix,
  shouldBe,
  stuckDoing,
  costLine,
  bullets,
  fixLine,
}: {
  icon: React.ReactNode;
  label: string;
  costNumber: string;
  costSuffix: string;
  shouldBe: string;
  stuckDoing: string;
  costLine: string;
  bullets: string[];
  fixLine: string;
}) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-7 sm:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-teal-700 font-semibold text-xs uppercase tracking-wider">{label}</span>
        </div>
        <div className="text-right">
          <span className="text-red-500 font-bold text-lg">{costNumber}</span>
          <span className="text-[#6b7280] text-sm ml-1">{costSuffix}</span>
        </div>
      </div>

      {/* Green box */}
      <div className="bg-[#f0fdfa] border border-[#99f6e8] rounded-lg p-4 mb-3">
        <div className="text-teal-700 text-xs font-semibold uppercase tracking-wider mb-1">Your agent should be</div>
        <div className="text-[#111827] text-sm">{shouldBe}</div>
      </div>

      {/* Red box */}
      <div className="bg-[#fef2f2] border border-[#fecaca] rounded-lg p-4 mb-4">
        <div className="text-red-600 text-xs font-semibold uppercase tracking-wider mb-1">Instead they're stuck</div>
        <div className="text-[#111827] text-sm">{stuckDoing}</div>
      </div>

      {/* Cost line */}
      <p className="text-sm italic text-[#6b7280] mb-4">{costLine}</p>

      {/* Red bullets */}
      <div className="space-y-2 mb-5">
        {bullets.map((b) => (
          <div key={b} className="flex items-start gap-2">
            <X className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <span className="text-sm text-[#111827]">{b}</span>
          </div>
        ))}
      </div>

      {/* Fix box */}
      <div className="bg-gray-50 border-l-4 border-teal-600 rounded-r-lg p-4">
        <p className="text-sm text-[#111827]">{fixLine}</p>
      </div>
    </div>
  );
}

export function ProblemSection() {
  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#111827] mb-4">
            Your agents should be closing — not typing
          </h2>
          <p className="text-[#6b7280] text-lg max-w-2xl mx-auto">
            Every minute on busywork is a minute not spent with a buyer. Let your agents do what they're great at.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <ProblemCard
            icon={<Home className="h-5 w-5 text-teal-600" />}
            label="Lead Engagement"
            costNumber="$100–225+"
            costSuffix="per lead — gone"
            shouldBe="Showing homes. Building relationships. Converting."
            stuckDoing="Copy-pasting 30 listings into an email no one reads."
            costLine="78% of leads ghost before your agent even picks up the phone."
            bullets={[
              "Generic listing dump — buyer sees spam",
              "Zero intent captured — CRM gets a name and nothing else",
              "No follow-up — lead goes to Zillow's ChatGPT",
            ]}
            fixLine="ResidenceHive handles the first response. Your agent steps in when the buyer is ready to talk."
          />
          <ProblemCard
            icon={<Zap className="h-5 w-5 text-teal-600" />}
            label="Offer Prep"
            costNumber="~15 min"
            costSuffix="per offer — wasted"
            shouldBe="Fighting to submit on tight deadlines. Winning deals."
            stuckDoing="Retyping property details into blank forms at midnight."
            costLine="Multiply that by 3 competing offers on a Friday night."
            bullets={[
              "Manual data entry across multiple forms",
              "Missing a clause = deal falls through",
              "Agent time burned on paperwork, not negotiation",
            ]}
            fixLine="ResidenceHive preps the draft. Your agent reviews, edits, and sends — in minutes, not hours."
          />
        </div>

        <p className="text-center text-teal-600 font-bold text-lg mt-12">
          Your agents close deals. We handle the rest.
        </p>
      </div>
    </section>
  );
}

import { Check, ArrowRight } from "lucide-react";

function MarketCard({
  flag,
  title,
  description,
  features,
  linkText,
  linkHref,
}: {
  flag: string;
  title: string;
  description: string;
  features: string[];
  linkText: string;
  linkHref: string;
}) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-7 sm:p-8">
      <div className="text-3xl mb-3">{flag}</div>
      <h3 className="text-xl font-bold text-[#111827] mb-3">{title}</h3>
      <p className="text-[#6b7280] text-sm mb-5">{description}</p>
      <div className="space-y-2 mb-6">
        {features.map((f) => (
          <div key={f} className="flex items-start gap-2">
            <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
            <span className="text-sm text-[#111827]">{f}</span>
          </div>
        ))}
      </div>
      <a href={linkHref} className="text-teal-600 font-medium text-sm hover:text-teal-700 flex items-center gap-1">
        {linkText} <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}

export function MarketsSection() {
  return (
    <section className="py-20 bg-[#f8faf9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#111827] mb-4">
            Localized for the markets you work in
          </h2>
          <p className="text-[#6b7280] text-lg max-w-2xl mx-auto">
            Forms, compliance rules, and agent workflows differ by market. ResidenceHive is built for each one.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <MarketCard
            flag="🇺🇸"
            title="Massachusetts"
            description="Purpose-built for MA agents. MLS PIN data, local compliance guardrails, and buyer engagement workflows designed for how Massachusetts transactions actually work."
            features={[
              "Lead intake and buyer qualification",
              "Compliance-first chatbot with Fair Housing guardrails",
              "MLS-contextual buyer reports",
            ]}
            linkText="See Massachusetts"
            linkHref="/massachusetts"
          />
          <MarketCard
            flag="🇨🇦"
            title="Ontario"
            description="Built around Ontario agent workflows. From buyer engagement to draft offer packages — localized for how Ontario deals move."
            features={[
              "Lead engagement and buyer intake",
              "Listing-aware offer preparation",
              "Draft OREA form generation for agent review",
            ]}
            linkText="See Ontario"
            linkHref="/ontario"
          />
        </div>
      </div>
    </section>
  );
}

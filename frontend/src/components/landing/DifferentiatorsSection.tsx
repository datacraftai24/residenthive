import { Check, X } from "lucide-react";

const capabilities = [
  "Brokerage-controlled answers",
  "MLS-contextual responses",
  "Automatic intent capture",
  "Compliance guardrails",
  "Risk detection and escalation",
  "Market-specific form generation",
];

export function DifferentiatorsSection() {
  return (
    <section className="py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#111827] mb-4">
            Why ResidenceHive?
          </h2>
          <p className="text-[#6b7280] text-lg">
            Generic AI hallucinates listings. Offer templates miss local requirements.
          </p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-3 bg-gray-50 border-b border-[#e5e7eb]">
            <div className="p-4 font-semibold text-[#111827] text-sm">Capability</div>
            <div className="p-4 font-semibold text-[#111827] text-sm text-center">CRM + ChatGPT</div>
            <div className="p-4 font-semibold text-[#111827] text-sm text-center">ResidenceHive</div>
          </div>
          {/* Rows */}
          {capabilities.map((cap, i) => (
            <div key={cap} className={`grid grid-cols-3 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"} border-b border-[#e5e7eb] last:border-b-0`}>
              <div className="p-4 text-sm text-[#111827]">{cap}</div>
              <div className="p-4 flex justify-center">
                <X className="h-5 w-5 text-red-500" />
              </div>
              <div className="p-4 flex justify-center">
                <Check className="h-5 w-5 text-teal-600" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

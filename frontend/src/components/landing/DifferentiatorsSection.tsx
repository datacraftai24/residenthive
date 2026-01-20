import { Check, X } from "lucide-react";

const capabilities = [
  "Brokerage-controlled answers",
  "MLS-contextual responses",
  "Automatic intent capture",
  "Compliance guardrails",
  "Risk detection & escalation",
];

export function DifferentiatorsSection() {
  return (
    <section id="differentiators" className="py-16 sm:py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Why ResidenceHive?
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Generic AI hallucinates listings. ResidenceHive is built for compliance-first real estate.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-3 bg-gray-50 border-b border-gray-200">
              <div className="p-4 text-left">
                <span className="font-semibold text-gray-900">Capability</span>
              </div>
              <div className="p-4 text-center border-l border-gray-200">
                <span className="font-semibold text-gray-500">CRM + ChatGPT</span>
              </div>
              <div className="p-4 text-center border-l border-gray-200 bg-teal-50">
                <span className="font-semibold text-teal-700">ResidenceHive</span>
              </div>
            </div>

            {/* Table Rows */}
            {capabilities.map((capability, index) => (
              <div
                key={index}
                className={`grid grid-cols-3 ${index < capabilities.length - 1 ? "border-b border-gray-100" : ""}`}
              >
                <div className="p-4 text-left">
                  <span className="text-gray-700">{capability}</span>
                </div>
                <div className="p-4 flex justify-center items-center border-l border-gray-100">
                  <X className="h-5 w-5 text-gray-300" />
                </div>
                <div className="p-4 flex justify-center items-center border-l border-gray-100 bg-teal-50/50">
                  <Check className="h-5 w-5 text-teal-600" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

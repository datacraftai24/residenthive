import { Target, MessageCircle, Brain, Link2 } from "lucide-react";

const features = [
  { icon: Target, title: "Curated Top-5", desc: "Instead of 40 listings, buyers get 5 ranked picks with clear explanations of why each fits." },
  { icon: MessageCircle, title: "Async Engagement", desc: "Buyers engage on their schedule. AI handles follow-up within brokerage-controlled parameters." },
  { icon: Brain, title: "Automatic Intent Capture", desc: "No forms. Natural conversation reveals timeline, budget, and preferences automatically." },
  { icon: Link2, title: "One Link, Zero Threads", desc: "Replace the 10-message email thread with a single shareable link." },
];

export function SmartResponseSection() {
  return (
    <section className="py-20 bg-[#f8faf9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#111827] mb-4">
            A smarter first response
          </h2>
          <p className="text-[#6b7280] text-lg max-w-2xl mx-auto">
            ResidenceHive transforms how brokerages engage leads from the first touchpoint.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-7 text-center">
              <f.icon className="h-8 w-8 text-teal-600 mx-auto mb-4" />
              <h3 className="font-semibold text-[#111827] mb-2">{f.title}</h3>
              <p className="text-sm text-[#6b7280]">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

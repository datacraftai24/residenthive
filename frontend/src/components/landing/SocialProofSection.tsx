export function SocialProofSection() {
  const stats = [
    { number: "2 Markets", label: "Active pilots" },
    { number: "MLS PIN", label: "& listing data access" },
    { number: "6-Tier", label: "Compliance framework" },
  ];

  return (
    <section className="py-20 bg-[#f8faf9]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#111827] mb-4">
            In pilot with Massachusetts and Ontario brokerages
          </h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-6 mb-10">
          {stats.map((s) => (
            <div key={s.label} className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-7 text-center">
              <div className="text-2xl font-bold text-teal-600 mb-1">{s.number}</div>
              <div className="text-sm text-[#6b7280]">{s.label}</div>
            </div>
          ))}
        </div>
        {/* Quote */}
        <div className="bg-white border-l-4 border-teal-600 rounded-r-[14px] border border-[#e5e7eb] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-7">
          <p className="text-[#111827] text-lg italic mb-3">
            "This saves me 15 minutes per listing and catches things I'd miss."
          </p>
          <p className="text-[#6b7280] text-sm">— Pilot agent</p>
        </div>
      </div>
    </section>
  );
}

import ResidenceHiveDemo from "./ResidenceHiveDemo";

export function DemoSection() {
  return (
    <section id="demo" className="py-20 bg-[#f8faf9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#111827] mb-4">
            See it in action
          </h2>
          <p className="text-[#6b7280] text-lg max-w-2xl mx-auto">
            Voice note → buyer report → compliant chatbot → agent dashboard. The full loop in 60 seconds.
          </p>
        </div>
        <div className="flex justify-center">
          <ResidenceHiveDemo />
        </div>
      </div>
    </section>
  );
}

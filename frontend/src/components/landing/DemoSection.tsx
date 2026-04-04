export function DemoSection() {
  return (
    <section id="how-it-works" className="py-16 sm:py-24 bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            See it in action
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Voice note to buyer report in under a minute. Watch the full loop.
          </p>
        </div>

        <div className="flex justify-center">
          <div className="w-full max-w-[820px] rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
            <iframe
              src="/demo.html"
              title="ResidenceHive Demo"
              className="w-full border-0"
              style={{ height: "780px" }}
              allow="autoplay"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const stats = [
  { number: "$100–225+", label: "Cost per lead" },
  { number: "78%", label: "Get no personalized response" },
  { number: "30–40", label: "Unranked listings per reply" },
  { number: "~15 min", label: "Saved per listing" },
];

export function NumbersBar() {
  return (
    <section className="border-y border-[#e5e7eb]">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[#e5e7eb]">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white py-8 px-6 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-teal-600 mb-1">{stat.number}</div>
              <div className="text-sm text-[#9ca3af]">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

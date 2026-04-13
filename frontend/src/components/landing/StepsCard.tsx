interface Step {
  number: string;
  title: string;
  description: string;
}

interface StepsCardProps {
  label: string;
  subtitle: string;
  steps: Step[];
  accentColor?: "teal" | "blue";
}

const colorMap = {
  teal: {
    bar: "bg-teal-600",
    badge: "text-teal-700 bg-[#f0fdfa] border-[#99f6e8]",
    number: "text-teal-600",
  },
  blue: {
    bar: "bg-blue-500",
    badge: "text-blue-700 bg-blue-50 border-blue-200",
    number: "text-blue-500",
  },
};

export function StepsCard({ label, subtitle, steps, accentColor = "teal" }: StepsCardProps) {
  const colors = colorMap[accentColor];

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className={`h-[3px] ${colors.bar}`} />
      <div className="p-7 sm:p-8">
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${colors.badge} mb-3`}>
          {label}
        </span>
        <p className="text-[#6b7280] text-sm mb-6">{subtitle}</p>
        <div className="space-y-4">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-4">
              <span className={`font-mono font-bold text-sm ${colors.number} w-6 shrink-0`}>
                {step.number}
              </span>
              <div>
                <span className="font-semibold text-[#111827]">{step.title}</span>
                {step.description && (
                  <span className="text-[#6b7280]"> — {step.description}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

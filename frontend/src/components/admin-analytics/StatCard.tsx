import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number | string;
  change?: number | null;
  icon: LucideIcon;
  iconColor?: string;
}

export default function StatCard({
  title,
  value,
  change,
  icon: Icon,
  iconColor = "text-blue-600",
}: StatCardProps) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-500">{title}</span>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-semibold text-slate-900">{value}</span>
        {change != null && (
          <span
            className={`text-xs font-medium mb-1 ${
              change > 0
                ? "text-green-600"
                : change < 0
                ? "text-red-600"
                : "text-slate-400"
            }`}
          >
            {change > 0 ? "+" : ""}
            {change}%
          </span>
        )}
      </div>
    </div>
  );
}

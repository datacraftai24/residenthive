import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface FunnelStep {
  status: string;
  count: number;
}

const STAGE_COLORS: Record<string, string> = {
  new: "#94a3b8",
  classified: "#3b82f6",
  engaged: "#8b5cf6",
  converted: "#10b981",
};

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  classified: "Classified",
  engaged: "Engaged",
  converted: "Converted",
};

export default function LeadFunnelChart({ data }: { data: FunnelStep[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No lead data yet
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: STAGE_LABELS[d.status] || d.status,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
        <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
        <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={STAGE_COLORS[entry.status] || "#94a3b8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

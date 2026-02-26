import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  category: string;
  count: number;
}

const COLORS: Record<string, string> = {
  profile: "#3b82f6",
  lead: "#8b5cf6",
  search: "#06b6d4",
  report: "#f59e0b",
  auth: "#10b981",
  email: "#ef4444",
  chat: "#ec4899",
};

export default function FeatureUsageChart({ data }: { data: DataPoint[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No usage data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="category" tick={{ fontSize: 12, fill: "#64748b" }} />
        <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
        <Bar
          dataKey="count"
          name="Events"
          radius={[4, 4, 0, 0]}
          fill="#3b82f6"
          // Per-bar color based on category
          shape={(props: any) => {
            const fill = COLORS[props.payload?.category] || "#3b82f6";
            return (
              <rect
                x={props.x}
                y={props.y}
                width={props.width}
                height={props.height}
                rx={4}
                fill={fill}
              />
            );
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

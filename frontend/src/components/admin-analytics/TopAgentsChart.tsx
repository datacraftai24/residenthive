import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Agent {
  agentId: number;
  name: string;
  email: string;
  eventCount: number;
}

export default function TopAgentsChart({ data }: { data: Agent[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No agent data yet
      </div>
    );
  }

  // Truncate names for display
  const chartData = data.map((d) => ({
    ...d,
    shortName: d.name.length > 16 ? d.name.slice(0, 14) + "..." : d.name,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 20, bottom: 5, left: 80 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} />
        <YAxis
          type="category"
          dataKey="shortName"
          tick={{ fontSize: 12, fill: "#64748b" }}
          width={75}
        />
        <Tooltip
          formatter={(value: number) => [value, "Events"]}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ""}
          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <Bar dataKey="eventCount" name="Events" fill="#3b82f6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

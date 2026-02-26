import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DataPoint {
  day: string;
  count: number;
  avgMs: number;
  p95Ms: number;
}

export default function ApiPerformanceChart({ data }: { data: DataPoint[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No performance data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="day"
          tickFormatter={(v) => {
            const d = new Date(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
          tick={{ fontSize: 12, fill: "#64748b" }}
        />
        <YAxis yAxisId="left" tick={{ fontSize: 12, fill: "#64748b" }} label={{ value: "ms", position: "insideLeft", offset: 10 }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: "#64748b" }} label={{ value: "count", position: "insideRight", offset: 10 }} />
        <Tooltip
          labelFormatter={(v) => new Date(v).toLocaleDateString()}
          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <Legend />
        <Bar yAxisId="right" dataKey="count" name="Searches" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
        <Line yAxisId="left" type="monotone" dataKey="avgMs" name="Avg (ms)" stroke="#3b82f6" strokeWidth={2} dot={false} />
        <Line yAxisId="left" type="monotone" dataKey="p95Ms" name="P95 (ms)" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 5" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface AgentOption {
  id: number;
  name: string;
  email: string;
}

interface Props {
  agents: AgentOption[];
  selectedAgentId: number | null;
  onSelectAgent: (id: number | null) => void;
  days: number;
}

export default function AgentDetailPanel({
  agents,
  selectedAgentId,
  onSelectAgent,
  days,
}: Props) {
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/admin/analytics/agent/${selectedAgentId}/detail`, { days }],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/analytics/agent/${selectedAgentId}/detail?days=${days}`,
        {
          headers: {
            Authorization: `Bearer ${await window.Clerk?.session?.getToken()}`,
          },
        },
      );
      if (!res.ok) throw new Error("Failed to load agent detail");
      return res.json();
    },
    enabled: !!selectedAgentId,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Select Agent</label>
        <select
          className="border border-slate-200 rounded-md px-3 py-1.5 text-sm bg-white"
          value={selectedAgentId ?? ""}
          onChange={(e) =>
            onSelectAgent(e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">Choose an agent...</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.email})
            </option>
          ))}
        </select>
      </div>

      {!selectedAgentId && (
        <div className="text-center py-12 text-slate-400 text-sm">
          Select an agent above to see their activity details
        </div>
      )}

      {selectedAgentId && isLoading && (
        <div className="text-center py-12 text-slate-400 text-sm">Loading...</div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Agent Info */}
          <div className="bg-slate-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-slate-700 mb-3">Agent Info</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-slate-500">Name:</span>{" "}
                <span className="font-medium">{data.agent.name}</span>
              </div>
              <div>
                <span className="text-slate-500">Email:</span>{" "}
                <span className="font-medium">{data.agent.email}</span>
              </div>
              <div>
                <span className="text-slate-500">Joined:</span>{" "}
                <span className="font-medium">
                  {data.agent.joinedAt
                    ? new Date(data.agent.joinedAt).toLocaleDateString()
                    : "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* Feature Usage */}
          <div className="bg-slate-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-slate-700 mb-3">Feature Usage</h4>
            {data.featureUsage.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.featureUsage}>
                  <XAxis dataKey="category" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-400 text-xs text-center py-8">No data</div>
            )}
          </div>

          {/* Daily Activity */}
          <div className="bg-slate-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-slate-700 mb-3">Daily Activity</h4>
            {data.dailyActivity.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.dailyActivity}>
                  <XAxis
                    dataKey="day"
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                    tick={{ fontSize: 10, fill: "#64748b" }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip
                    labelFormatter={(v) => new Date(v).toLocaleDateString()}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-400 text-xs text-center py-8">No data</div>
            )}
          </div>
        </div>
      )}

      {/* Recent Actions Timeline */}
      {data?.recentActions?.length > 0 && (
        <div className="bg-slate-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-slate-700 mb-3">Recent Actions</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.recentActions.map((action: any, i: number) => (
              <div
                key={i}
                className="flex items-center gap-3 text-sm py-1.5 border-b border-slate-100 last:border-0"
              >
                <span className="text-slate-400 text-xs w-16 shrink-0">
                  {action.createdAt
                    ? new Date(action.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                  {action.eventType}
                </span>
                <span className="text-slate-600 truncate">
                  {action.entityType && `${action.entityType}`}
                  {action.entityId && ` #${action.entityId}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

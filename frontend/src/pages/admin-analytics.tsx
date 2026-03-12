import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Users, UserPlus, Inbox, Search, FileText } from "lucide-react";

import DateRangeSelector from "@/components/admin-analytics/DateRangeSelector";
import StatCard from "@/components/admin-analytics/StatCard";
import ActivityOverTimeChart from "@/components/admin-analytics/ActivityOverTimeChart";
import FeatureUsageChart from "@/components/admin-analytics/FeatureUsageChart";
import TopAgentsChart from "@/components/admin-analytics/TopAgentsChart";
import LeadFunnelChart from "@/components/admin-analytics/LeadFunnelChart";
import ApiPerformanceChart from "@/components/admin-analytics/ApiPerformanceChart";
import AgentDetailPanel from "@/components/admin-analytics/AgentDetailPanel";
import PilotMetricsPanel from "@/components/admin-analytics/PilotMetricsPanel";

async function authFetch(url: string) {
  const token = await window.Clerk?.session?.getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 403) throw new Error("Admin access required");
  if (!res.ok) throw new Error("Failed to fetch analytics data");
  return res.json();
}

export default function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);

  const overview = useQuery({
    queryKey: ["/api/admin/analytics/overview", { days }],
    queryFn: () => authFetch(`/api/admin/analytics/overview?days=${days}`),
  });

  const activityOverTime = useQuery({
    queryKey: ["/api/admin/analytics/activity-over-time", { days }],
    queryFn: () => authFetch(`/api/admin/analytics/activity-over-time?days=${days}`),
  });

  const featureUsage = useQuery({
    queryKey: ["/api/admin/analytics/feature-usage", { days }],
    queryFn: () => authFetch(`/api/admin/analytics/feature-usage?days=${days}`),
  });

  const topAgents = useQuery({
    queryKey: ["/api/admin/analytics/top-agents", { days }],
    queryFn: () => authFetch(`/api/admin/analytics/top-agents?days=${days}&limit=10`),
  });

  const leadFunnel = useQuery({
    queryKey: ["/api/admin/analytics/lead-funnel", { days }],
    queryFn: () => authFetch(`/api/admin/analytics/lead-funnel?days=${days}`),
  });

  const apiPerformance = useQuery({
    queryKey: ["/api/admin/analytics/api-performance", { days: Math.min(days, 30) }],
    queryFn: () =>
      authFetch(`/api/admin/analytics/api-performance?days=${Math.min(days, 30)}`),
  });

  const pilotMetrics = useQuery({
    queryKey: ["/api/admin/analytics/pilot-metrics", { days }],
    queryFn: () => authFetch(`/api/admin/analytics/pilot-metrics?days=${days}`),
  });

  const agentsList = useQuery({
    queryKey: ["/api/admin/analytics/agents-list"],
    queryFn: () => authFetch("/api/admin/analytics/agents-list"),
  });

  // Handle 403 — show access denied
  if (overview.error?.message === "Admin access required") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-500 mb-4">You don't have admin access to view analytics.</p>
          <Link href="/dashboard">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
              Back to Dashboard
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const o = overview.data;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <button className="text-slate-400 hover:text-slate-600 transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Platform Analytics</h1>
              <p className="text-sm text-slate-500">Admin dashboard</p>
            </div>
          </div>
          <DateRangeSelector value={days} onChange={setDays} />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            title="Active Agents"
            value={o?.activeAgents ?? "-"}
            icon={Users}
            iconColor="text-blue-600"
          />
          <StatCard
            title="Profiles Created"
            value={o?.profilesCreated ?? "-"}
            change={o?.profilesChange}
            icon={UserPlus}
            iconColor="text-green-600"
          />
          <StatCard
            title="Leads Processed"
            value={o?.leadsProcessed ?? "-"}
            change={o?.leadsChange}
            icon={Inbox}
            iconColor="text-purple-600"
          />
          <StatCard
            title="Searches Run"
            value={o?.searchesRun ?? "-"}
            icon={Search}
            iconColor="text-cyan-600"
          />
          <StatCard
            title="Reports Generated"
            value={o?.reportsGenerated ?? "-"}
            icon={FileText}
            iconColor="text-amber-600"
          />
        </div>

        {/* Pilot KPIs */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          {pilotMetrics.isLoading ? (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
              Loading pilot metrics...
            </div>
          ) : pilotMetrics.data ? (
            <PilotMetricsPanel data={pilotMetrics.data} />
          ) : null}
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-medium text-slate-700 mb-4">
              Agent Activity Over Time
            </h3>
            {activityOverTime.isLoading ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                Loading...
              </div>
            ) : (
              <ActivityOverTimeChart data={activityOverTime.data ?? []} />
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-medium text-slate-700 mb-4">Feature Usage</h3>
            {featureUsage.isLoading ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                Loading...
              </div>
            ) : (
              <FeatureUsageChart data={featureUsage.data ?? []} />
            )}
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-medium text-slate-700 mb-4">Top Agents</h3>
            {topAgents.isLoading ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                Loading...
              </div>
            ) : (
              <TopAgentsChart data={topAgents.data ?? []} />
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-medium text-slate-700 mb-4">Lead Funnel</h3>
            {leadFunnel.isLoading ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                Loading...
              </div>
            ) : (
              <LeadFunnelChart data={leadFunnel.data ?? []} />
            )}
          </div>
        </div>

        {/* API Performance */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-medium text-slate-700 mb-4">API Performance</h3>
          {apiPerformance.isLoading ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
              Loading...
            </div>
          ) : (
            <ApiPerformanceChart data={apiPerformance.data ?? []} />
          )}
        </div>

        {/* Agent Detail */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-medium text-slate-700 mb-4">Agent Detail View</h3>
          <AgentDetailPanel
            agents={agentsList.data ?? []}
            selectedAgentId={selectedAgentId}
            onSelectAgent={setSelectedAgentId}
            days={days}
          />
        </div>
      </div>
    </div>
  );
}

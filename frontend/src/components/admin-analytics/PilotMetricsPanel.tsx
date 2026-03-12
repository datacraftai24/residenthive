import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PilotMetrics {
  leadResponseTime: {
    avgMinutes: number;
    medianMinutes: number;
    under5MinPct: number;
    totalResponded: number;
  };
  reportOpenRate: {
    totalReportsSent: number;
    totalReportsViewed: number;
    openRatePct: number;
  };
  buyerEngagement: {
    avgMessagesPerSession: number;
    avgPropertiesDiscussed: number;
    ctaClickRate: number;
    contactCaptureRate: number;
    totalSessions: number;
  };
  leadToShowingConversion: {
    totalEngaged: number;
    totalConverted: number;
    conversionRatePct: number;
  };
  complianceFlags: {
    totalSessionsWithFlags: number;
    totalSessions: number;
    flagRatePct: number;
    topTopics: { topic: string; count: number }[];
  };
  agentAdoption: {
    agentsUsingPlatform: number;
    totalAgents: number;
    adoptionRatePct: number;
    leadsProcessedThroughPlatform: number;
    totalLeads: number;
  };
  agentTimeSaved: {
    avgSearchTimeMs: number;
    avgSearchTimeMinutes: number;
    manualBaselineMinutes: number;
    estimatedMinutesSavedPerLead: number;
    totalSearches: number;
    totalHoursSaved: number;
  };
}

interface Props {
  data: PilotMetrics;
}

type Status = "green" | "amber" | "red";

function statusColor(status: Status) {
  if (status === "green") return "text-emerald-600";
  if (status === "amber") return "text-amber-600";
  return "text-red-600";
}

function statusBg(status: Status) {
  if (status === "green") return "bg-emerald-50 border-emerald-200";
  if (status === "amber") return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function statusDot(status: Status) {
  if (status === "green") return "bg-emerald-500";
  if (status === "amber") return "bg-amber-500";
  return "bg-red-500";
}

function getStatus(value: number, greenThreshold: number, amberThreshold: number, higher = true): Status {
  if (higher) {
    if (value >= greenThreshold) return "green";
    if (value >= amberThreshold) return "amber";
    return "red";
  }
  // Lower is better
  if (value <= greenThreshold) return "green";
  if (value <= amberThreshold) return "amber";
  return "red";
}

function MetricCard({
  title,
  value,
  unit,
  subtitle,
  benchmark,
  status,
}: {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  benchmark?: string;
  status: Status;
}) {
  return (
    <div className={`rounded-lg border p-4 ${statusBg(status)}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-2 w-2 rounded-full ${statusDot(status)}`} />
        <span className="text-sm font-medium text-slate-700">{title}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${statusColor(status)}`}>{value}</span>
        {unit && <span className="text-sm text-slate-500">{unit}</span>}
      </div>
      {subtitle && (
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      )}
      {benchmark && (
        <p className="text-xs text-slate-400 mt-1 italic">{benchmark}</p>
      )}
    </div>
  );
}

export default function PilotMetricsPanel({ data }: Props) {
  const { leadResponseTime, reportOpenRate, buyerEngagement, leadToShowingConversion, complianceFlags, agentAdoption, agentTimeSaved } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-lg font-semibold text-slate-900">Pilot KPIs</h2>
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
          7 metrics
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Lead Response Time */}
        <MetricCard
          title="Lead Response Time"
          value={leadResponseTime.avgMinutes}
          unit="min avg"
          subtitle={`${leadResponseTime.under5MinPct}% under 5 min (${leadResponseTime.totalResponded} leads)`}
          benchmark="vs industry avg 24-48 hrs"
          status={getStatus(leadResponseTime.avgMinutes, 5, 15, false)}
        />

        {/* 2. Report Open Rate */}
        <MetricCard
          title="Report Open Rate"
          value={reportOpenRate.openRatePct}
          unit="%"
          subtitle={`${reportOpenRate.totalReportsViewed} of ${reportOpenRate.totalReportsSent} reports viewed`}
          benchmark="vs industry avg 20-30%"
          status={getStatus(reportOpenRate.openRatePct, 50, 30)}
        />

        {/* 3. Buyer Engagement */}
        <MetricCard
          title="Buyer Engagement"
          value={buyerEngagement.avgMessagesPerSession}
          unit="msgs/session"
          subtitle={`${buyerEngagement.ctaClickRate}% CTA clicks, ${buyerEngagement.contactCaptureRate}% contact capture`}
          benchmark={`${buyerEngagement.totalSessions} total sessions`}
          status={getStatus(buyerEngagement.avgMessagesPerSession, 3, 1.5)}
        />

        {/* 4. Lead-to-Showing Conversion */}
        <MetricCard
          title="Lead-to-Showing"
          value={leadToShowingConversion.conversionRatePct}
          unit="% conversion"
          subtitle={`${leadToShowingConversion.totalConverted} of ${leadToShowingConversion.totalEngaged} engaged leads`}
          benchmark="vs industry avg 10-15%"
          status={getStatus(leadToShowingConversion.conversionRatePct, 30, 15)}
        />

        {/* 5. Agent Adoption */}
        <MetricCard
          title="Agent Adoption"
          value={agentAdoption.adoptionRatePct}
          unit="%"
          subtitle={`${agentAdoption.agentsUsingPlatform} of ${agentAdoption.totalAgents} agents active`}
          benchmark={`${agentAdoption.leadsProcessedThroughPlatform}/${agentAdoption.totalLeads} leads through platform`}
          status={getStatus(agentAdoption.adoptionRatePct, 70, 40)}
        />

        {/* 6. Agent Time Saved */}
        <MetricCard
          title="Time Saved"
          value={agentTimeSaved.totalHoursSaved}
          unit="hrs total"
          subtitle={`~${agentTimeSaved.estimatedMinutesSavedPerLead} min saved/search (${agentTimeSaved.totalSearches} searches)`}
          benchmark="vs 30 min manual baseline"
          status={getStatus(agentTimeSaved.estimatedMinutesSavedPerLead, 20, 10)}
        />

        {/* 7. Compliance Flags */}
        <MetricCard
          title="Compliance Flags"
          value={complianceFlags.totalSessionsWithFlags}
          unit="sessions flagged"
          subtitle={`${complianceFlags.flagRatePct}% of ${complianceFlags.totalSessions} sessions`}
          benchmark="Topics needing agent review"
          status={getStatus(complianceFlags.flagRatePct, 10, 25, false)}
        />

        {/* Compliance Topics Mini Chart */}
        {complianceFlags.topTopics.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <span className="text-sm font-medium text-slate-700 block mb-2">
              Top Risk Topics
            </span>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart
                data={complianceFlags.topTopics.slice(0, 6)}
                layout="vertical"
                margin={{ left: 0, right: 8, top: 0, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="topic"
                  width={70}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, MessageSquare, UserCheck, Clock, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface PilotStats {
  active_agents: number;
  total_agents: number;
  pending_invitations: number;
  leads_processed: number;
  reports_sent: number;
}

interface BrokerageInfo {
  id: number;
  name: string;
}

function StatCard({
  title,
  value,
  icon,
  subtitle,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
          </div>
          <div className="bg-blue-50 p-3 rounded-full">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPilotStatusPage() {
  const { data: brokerage } = useQuery<BrokerageInfo>({
    queryKey: ["/api/brokerages/me"],
  });

  const { data: stats, isLoading } = useQuery<PilotStats>({
    queryKey: [`/api/brokerages/${brokerage?.id}/pilot-stats`],
    enabled: !!brokerage?.id,
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard">
            <button className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Pilot Status</h1>
            {brokerage && (
              <p className="text-sm text-gray-500">{brokerage.name}</p>
            )}
          </div>
        </div>

        {isLoading || !stats ? (
          <div className="text-center py-12 text-gray-500">Loading stats...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              title="Active Agents"
              value={stats.active_agents}
              icon={<UserCheck className="h-6 w-6 text-green-600" />}
              subtitle={`${stats.total_agents} total, ${stats.active_agents} completed setup`}
            />
            <StatCard
              title="Pending Invitations"
              value={stats.pending_invitations}
              icon={<Clock className="h-6 w-6 text-amber-600" />}
              subtitle="Awaiting agent signups"
            />
            <StatCard
              title="Leads Processed"
              value={stats.leads_processed}
              icon={<MessageSquare className="h-6 w-6 text-blue-600" />}
            />
            <StatCard
              title="Buyer Briefs Sent"
              value={stats.reports_sent}
              icon={<FileText className="h-6 w-6 text-purple-600" />}
            />
            <StatCard
              title="Total Team Size"
              value={stats.total_agents}
              icon={<Users className="h-6 w-6 text-blue-600" />}
            />
          </div>
        )}
      </div>
    </div>
  );
}

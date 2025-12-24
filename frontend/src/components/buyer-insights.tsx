import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Lightbulb,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Heart,
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  Target,
  AlertTriangle,
  Quote,
  Sparkles,
  Activity,
  PieChart,
  BarChart2,
  Home,
} from "lucide-react";

interface BuyerInsightsProps {
  profileId: number;
}

interface InsightsResponse {
  profileId: number;
  hasData: boolean;
  statistics: {
    totalSessions: number;
    totalMessages: number;
    totalUserMessages: number;
    totalAssistantMessages: number;
    totalInteractions: number;
    totalMemories: number;
    savedCount: number;
    likesCount: number;
    dislikesCount: number;
    favoritesCount: number;
    topicBreakdown: Record<string, number>;
    avgEngagementScore: number;
    latestDecisionStage: string;
    sentimentTrend: string;
    avgSentiment: number;
    totalReturnVisits: number;
  };
  insights: {
    topPreferences: string[];
    dealbreakers: string[];
    emotionalState: string;
    readinessScore: number;
    readinessReasoning: string;
    keyQuotes: string[];
    recommendedActions: string[];
    buyerPersona: string;
  };
  recentInteractions: Array<{
    listingId: string;
    type: string;
    reason: string | null;
    emotionalResponse: string | null;
    createdAt: string;
  }>;
  sentimentHistory: Array<{
    timestamp: string;
    score: number | null;
  }>;
}

// Mini pie chart component
function MiniPieChart({ data, colors }: { data: Record<string, number>; colors: string[] }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return <span className="text-slate-400 text-sm">No data</span>;

  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 5);
  let startAngle = 0;

  const paths = entries.map(([key, value], i) => {
    const percentage = value / total;
    const angle = percentage * 360;
    const endAngle = startAngle + angle;

    // Calculate arc path
    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);
    const radius = 40;
    const cx = 50, cy = 50;

    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;

    const pathD = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    startAngle = endAngle;

    return <path key={key} d={pathD} fill={colors[i % colors.length]} className="opacity-80 hover:opacity-100 transition-opacity" />;
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-20 h-20">
        {paths}
      </svg>
      <div className="flex flex-col gap-1">
        {entries.map(([key, value], i) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="capitalize text-slate-600">{key}</span>
            <span className="text-slate-400">({Math.round((value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Mini bar chart component
function MiniBarChart({ data, maxBars = 5, color = "#3b82f6" }: { data: Record<string, number>; maxBars?: number; color?: string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, maxBars);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  if (entries.length === 0) return <span className="text-slate-400 text-sm">No data</span>;

  return (
    <div className="space-y-2 w-full">
      {entries.map(([key, value]) => (
        <div key={key} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="capitalize text-slate-600">{key}</span>
            <span className="text-slate-400">{value}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Sentiment trend visualization
function SentimentTrendChart({ history }: { history: Array<{ timestamp: string; score: number | null }> }) {
  const validHistory = history.filter(h => h.score !== null);
  if (validHistory.length < 2) {
    return <span className="text-slate-400 text-sm">Not enough data for trend</span>;
  }

  const scores = validHistory.map(h => h.score as number);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  const width = 200;
  const height = 50;
  const points = scores.map((score, i) => {
    const x = (i / (scores.length - 1)) * width;
    const y = height - ((score - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-12">
        <defs>
          <linearGradient id="sentimentGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="#22c55e"
          strokeWidth="2"
          points={points}
          className="drop-shadow-sm"
        />
        <polygon
          fill="url(#sentimentGradient)"
          points={`0,${height} ${points} ${width},${height}`}
        />
      </svg>
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>Oldest</span>
        <span>Recent</span>
      </div>
    </div>
  );
}

// Readiness gauge
function ReadinessGauge({ score }: { score: number }) {
  const percentage = (score / 10) * 100;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (score >= 8) return "#22c55e";
    if (score >= 5) return "#f59e0b";
    return "#ef4444";
  };

  const getLabel = () => {
    if (score >= 8) return "Hot Lead";
    if (score >= 5) return "Warm Lead";
    if (score >= 3) return "Developing";
    return "Early Stage";
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg className="w-28 h-28 transform -rotate-90">
          <circle cx="56" cy="56" r="45" stroke="#e2e8f0" strokeWidth="8" fill="none" />
          <circle
            cx="56"
            cy="56"
            r="45"
            stroke={getColor()}
            strokeWidth="8"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color: getColor() }}>{score}</span>
          <span className="text-xs text-slate-400">/10</span>
        </div>
      </div>
      <Badge className="mt-2" style={{ backgroundColor: getColor() }}>
        {getLabel()}
      </Badge>
    </div>
  );
}

export default function BuyerInsights({ profileId }: BuyerInsightsProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<InsightsResponse>({
    queryKey: [`/api/buyer-insights/${profileId}`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false, // On-demand only
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const getSentimentIcon = (trend: string) => {
    switch (trend) {
      case "improving": return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "declining": return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-slate-400" />;
    }
  };

  const getEmotionalStateColor = (state: string) => {
    switch (state) {
      case "excited": return "bg-green-100 text-green-700 border-green-200";
      case "urgent": return "bg-red-100 text-red-700 border-red-200";
      case "cautious": return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "analytical": return "bg-blue-100 text-blue-700 border-blue-200";
      default: return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const pieColors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold">Buyer Insights</h3>
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-3" />
            <p className="text-red-600 font-medium">Failed to load insights</p>
            <p className="text-red-500 text-sm mt-1">Please try again later</p>
            <Button variant="outline" onClick={handleRefresh} className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.hasData) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <MessageCircle className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-700 mb-2">No Chat History Yet</h3>
            <p className="text-slate-500 max-w-md mx-auto">
              This buyer hasn't started chatting with the AI assistant yet.
              Insights will appear here once they begin their property search journey.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { statistics, insights, recentInteractions } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold text-lg">Buyer Insights</h3>
          <Badge variant="outline" className="ml-2">
            {statistics.totalMessages} messages analyzed
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Analyzing..." : "Refresh Insights"}
        </Button>
      </div>

      {/* Main Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <Activity className="h-5 w-5 mx-auto text-blue-500 mb-1" />
              <p className="text-2xl font-bold text-slate-800">{statistics.totalSessions}</p>
              <p className="text-xs text-slate-500">Chat Sessions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <MessageCircle className="h-5 w-5 mx-auto text-green-500 mb-1" />
              <p className="text-2xl font-bold text-slate-800">{statistics.totalMessages}</p>
              <p className="text-xs text-slate-500">Messages</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <Home className="h-5 w-5 mx-auto text-amber-500 mb-1" />
              <p className="text-2xl font-bold text-slate-800">{statistics.savedCount}</p>
              <p className="text-xs text-slate-500">Saved Properties</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Readiness & Persona Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Readiness Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-500" />
              Purchase Readiness
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-6">
              <ReadinessGauge score={insights.readinessScore} />
              <div className="flex-1">
                <p className="text-sm text-slate-600 mb-3">{insights.readinessReasoning}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Decision Stage:</span>
                  <Badge variant="outline" className="capitalize">
                    {statistics.latestDecisionStage}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Buyer Persona */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              Buyer Persona
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700 mb-4">{insights.buyerPersona}</p>
            <div className="flex flex-wrap gap-2">
              <Badge className={getEmotionalStateColor(insights.emotionalState)}>
                {insights.emotionalState}
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                {getSentimentIcon(statistics.sentimentTrend)}
                Sentiment: {statistics.sentimentTrend}
              </Badge>
              <Badge variant="outline">
                {statistics.totalReturnVisits} return visits
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preferences & Dealbreakers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Preferences */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-green-500" />
              Top Preferences
            </CardTitle>
            <CardDescription>What this buyer is looking for</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {insights.topPreferences.map((pref, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-slate-700">{pref}</span>
                </li>
              ))}
              {insights.topPreferences.length === 0 && (
                <p className="text-sm text-slate-400">No clear preferences identified yet</p>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Dealbreakers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Dealbreakers
            </CardTitle>
            <CardDescription>What to avoid showing this buyer</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {insights.dealbreakers.map((db, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    ✕
                  </span>
                  <span className="text-sm text-slate-700">{db}</span>
                </li>
              ))}
              {insights.dealbreakers.length === 0 && (
                <p className="text-sm text-slate-400">No dealbreakers identified yet</p>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Key Quotes */}
      {insights.keyQuotes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Quote className="h-4 w-4 text-blue-500" />
              Key Quotes
            </CardTitle>
            <CardDescription>Notable statements from this buyer</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.keyQuotes.map((quote, i) => (
                <div key={i} className="pl-4 border-l-2 border-blue-200">
                  <p className="text-sm text-slate-700 italic">"{quote}"</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommended Actions */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Recommended Actions
          </CardTitle>
          <CardDescription>AI-suggested next steps for this buyer</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {insights.recommendedActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                  →
                </span>
                <span className="text-sm text-slate-700">{action}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Analytics Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Topic Breakdown */}
        {Object.keys(statistics.topicBreakdown || {}).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <PieChart className="h-4 w-4 text-indigo-500" />
                Conversation Topics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MiniPieChart data={statistics.topicBreakdown} colors={pieColors} />
            </CardContent>
          </Card>
        )}

        {/* Engagement Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-cyan-500" />
              Engagement Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MiniBarChart 
              data={{
                "User Messages": statistics.totalUserMessages || 0,
                "AI Responses": statistics.totalAssistantMessages || 0,
                "Properties Saved": statistics.savedCount || 0,
                "Return Visits": statistics.totalReturnVisits || 0,
              }} 
              color="#06b6d4" 
            />
          </CardContent>
        </Card>
      </div>

      {/* Recent Property Interactions */}
      {recentInteractions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Home className="h-4 w-4 text-slate-500" />
              Recent Property Reactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentInteractions.slice(0, 5).map((interaction, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    {interaction.type === "like" ? (
                      <ThumbsUp className="h-4 w-4 text-green-500" />
                    ) : interaction.type === "dislike" ? (
                      <ThumbsDown className="h-4 w-4 text-red-500" />
                    ) : (
                      <Heart className="h-4 w-4 text-pink-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        Property #{interaction.listingId?.substring(0, 8) || "Unknown"}
                      </p>
                      {interaction.reason && (
                        <p className="text-xs text-slate-500">{interaction.reason}</p>
                      )}
                    </div>
                  </div>
                  {interaction.emotionalResponse && (
                    <Badge variant="outline" className="text-xs">
                      {interaction.emotionalResponse}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


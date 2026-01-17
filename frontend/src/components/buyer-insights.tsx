import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  User,
  CheckCircle2,
  XCircle,
  Home,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  ArrowRight,
  Flame,
  Thermometer,
  Snowflake,
  Building,
  DollarSign,
  Handshake,
  Calendar,
} from "lucide-react";
import ChatInsightsCard from "./chat-insights-card";

interface BuyerInsightsProps {
  profileId: number;
}

interface MustHaveItem {
  item: string;
  confidence: "Confirmed" | "Likely" | "Assumed";
  sourceQuote?: string;
}

interface PropertyInterest {
  listingId: string;
  address: string;
  interestLevel: "Hot" | "Warm" | "Cold";
  positiveSignals: string[];
  negativeSignals: string[];
  questionsAsked: string[];
  agentRecommendation: string;
}

interface NextStep {
  action: string;
  type: "property" | "pricing" | "negotiation" | "communication" | "showing";
  priority: "high" | "medium";
}

interface ReportData {
  clientSnapshot: {
    buyerType: string;
    priceSensitivity: string;
    urgencySignal: string;
    decisionDrivers: string[];
  };
  mustHaves: MustHaveItem[];
  dealbreakers: MustHaveItem[];
  propertyInterest: PropertyInterest[];
  crossPropertyInsights: string[];
  nextSteps: NextStep[];
}

interface InsightsResponse {
  profileId: number;
  hasData: boolean;
  report: ReportData;
  stats: {
    messagesAnalyzed: number;
    propertiesSaved: number;
    reportFeedbackCount?: number;
  };
}

// Chat insights types
interface ChatSummary {
  sessionId?: string;
  totalMessages: number;
  engagementLevel: string;
  readiness: string;
  ctaShown?: boolean;
  ctaClicked?: boolean;
  contactCaptured?: boolean;
  preferences: Record<string, any>;
  propertiesDiscussed: string[];
  lastActivity?: string;
}

interface ChatInsightsData {
  riskTopicsDiscussed: string[];
  topQuestions: string[];
  objections: string[];
  suggestedAction: string;
  followUpMessage: string;
}

interface ChatInsightsResponse {
  hasSession: boolean;
  summary: ChatSummary | null;
  insights: ChatInsightsData | null;
}

// Action type badge with icon
function ActionTypeBadge({ type }: { type: string }) {
  const config: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    property: { 
      icon: <Building className="h-3 w-3" />, 
      label: "Properties",
      className: "bg-blue-100 text-blue-700 border-blue-200"
    },
    pricing: { 
      icon: <DollarSign className="h-3 w-3" />, 
      label: "Pricing",
      className: "bg-green-100 text-green-700 border-green-200"
    },
    negotiation: { 
      icon: <Handshake className="h-3 w-3" />, 
      label: "Negotiation",
      className: "bg-purple-100 text-purple-700 border-purple-200"
    },
    communication: { 
      icon: <MessageCircle className="h-3 w-3" />, 
      label: "Communication",
      className: "bg-slate-100 text-slate-700 border-slate-200"
    },
    showing: { 
      icon: <Calendar className="h-3 w-3" />, 
      label: "Showing",
      className: "bg-amber-100 text-amber-700 border-amber-200"
    },
  };
  
  const { icon, label, className } = config[type] || config.communication;
  
  return (
    <Badge variant="outline" className={`text-xs flex items-center gap-1 ${className}`}>
      {icon}
      {label}
    </Badge>
  );
}

// Confidence badge component
function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    Confirmed: "bg-green-100 text-green-700 border-green-200",
    Likely: "bg-amber-100 text-amber-700 border-amber-200",
    Assumed: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <Badge variant="outline" className={`text-xs ${styles[confidence] || styles.Assumed}`}>
      {confidence}
    </Badge>
  );
}

// Interest level indicator
function InterestIndicator({ level }: { level: string }) {
  const config: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
    Hot: { 
      icon: <Flame className="h-4 w-4" />, 
      color: "text-red-600", 
      bg: "bg-red-100" 
    },
    Warm: { 
      icon: <Thermometer className="h-4 w-4" />, 
      color: "text-amber-600", 
      bg: "bg-amber-100" 
    },
    Cold: { 
      icon: <Snowflake className="h-4 w-4" />, 
      color: "text-blue-600", 
      bg: "bg-blue-100" 
    },
  };
  const { icon, color, bg } = config[level] || config.Warm;
  
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${bg} ${color}`}>
      {icon}
      <span className="text-sm font-medium">{level}</span>
    </div>
  );
}

// Collapsible section component
function CollapsibleSection({ 
  title, 
  children, 
  defaultOpen = true 
}: { 
  title: string; 
  children: React.ReactNode; 
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-sm font-medium text-slate-700">{title}</span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>
      {isOpen && <div className="pb-3">{children}</div>}
    </div>
  );
}

export default function BuyerInsights({ profileId }: BuyerInsightsProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<InsightsResponse>({
    queryKey: [`/api/buyer-insights/${profileId}`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch chat insights from chatbot sessions
  const { data: chatInsights } = useQuery<ChatInsightsResponse>({
    queryKey: [`/api/buyer-profiles/${profileId}/chat-insights`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!profileId,
    staleTime: 60 * 1000,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="text-center">
            <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-2" />
            <p className="text-red-600 font-medium">Failed to load report</p>
            <Button variant="outline" onClick={handleRefresh} className="mt-3">
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
          <div className="text-center py-6">
            <MessageCircle className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <h3 className="font-medium text-slate-700 mb-1">No Activity Yet</h3>
            <p className="text-sm text-slate-500">
              Insights will appear once the buyer starts chatting and saving properties.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { report, stats } = data;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          Based on {stats.messagesAnalyzed} messages · {stats.propertiesSaved} properties saved
          {stats.reportFeedbackCount ? ` · ${stats.reportFeedbackCount} report feedback` : ""}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Chat Insights - from chatbot session data */}
      {chatInsights?.hasSession && chatInsights.summary && (
        <ChatInsightsCard
          summary={chatInsights.summary}
          insights={chatInsights.insights}
          compact
        />
      )}

      {/* SECTION: NEXT STEPS - NOW AT THE TOP */}
      <Card className="border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            What To Do Next
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.nextSteps && report.nextSteps.length > 0 ? (
            <ul className="space-y-3">
              {report.nextSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 bg-white/60 rounded-lg p-3 border border-amber-100">
                  <span className={`flex-shrink-0 w-7 h-7 rounded-full text-sm flex items-center justify-center font-bold ${
                    step.priority === "high" 
                      ? "bg-amber-500 text-white" 
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 font-medium">{step.action}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <ActionTypeBadge type={step.type} />
                      {step.priority === "high" && (
                        <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">
                          High Priority
                        </Badge>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No specific actions recommended yet.</p>
          )}
        </CardContent>
      </Card>

      {/* SECTION A: Client Snapshot */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-slate-500" />
            Client Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Buyer Type</p>
              <p className="font-medium text-slate-800">{report.clientSnapshot.buyerType}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Price Sensitivity</p>
              <Badge variant={
                report.clientSnapshot.priceSensitivity === "High" ? "destructive" :
                report.clientSnapshot.priceSensitivity === "Low" ? "secondary" : "default"
              }>
                {report.clientSnapshot.priceSensitivity}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Urgency</p>
              <Badge variant={
                report.clientSnapshot.urgencySignal === "Ready to act" ? "default" :
                report.clientSnapshot.urgencySignal === "Shortlisting" ? "secondary" : "outline"
              }>
                {report.clientSnapshot.urgencySignal}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Decision Drivers</p>
              <div className="flex flex-wrap gap-1">
                {report.clientSnapshot.decisionDrivers.length > 0 ? (
                  report.clientSnapshot.decisionDrivers.map((driver, i) => (
                    <span key={i} className="text-sm text-slate-700">
                      {i > 0 && " > "}{driver}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-400">Not identified</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION B: Must-Haves & Dealbreakers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Must-Haves */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Must-Haves
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.mustHaves.length > 0 ? (
              <ul className="space-y-2">
                {report.mustHaves.map((item, i) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <span className="text-sm text-slate-700">{item.item}</span>
                    <ConfidenceBadge confidence={item.confidence} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No clear must-haves identified yet</p>
            )}
          </CardContent>
        </Card>

        {/* Dealbreakers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Dealbreakers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.dealbreakers.length > 0 ? (
              <ul className="space-y-2">
                {report.dealbreakers.map((item, i) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <span className="text-sm text-slate-700">{item.item}</span>
                    <ConfidenceBadge confidence={item.confidence} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No dealbreakers identified yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SECTION C: Property Interest Summary */}
      {report.propertyInterest.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="h-4 w-4 text-slate-500" />
              Property Interest
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.propertyInterest.map((property, i) => (
              <div key={i} className="border rounded-lg p-3 bg-slate-50/50">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-slate-800">{property.address}</p>
                    <p className="text-xs text-slate-500">ID: {property.listingId}</p>
                  </div>
                  <InterestIndicator level={property.interestLevel} />
                </div>
                
                <div className="space-y-1">
                  {/* Positive Signals */}
                  {property.positiveSignals.length > 0 && (
                    <CollapsibleSection title={`Positive Signals (${property.positiveSignals.length})`}>
                      <ul className="space-y-1 pl-2">
                        {property.positiveSignals.map((signal, j) => (
                          <li key={j} className="text-sm text-green-700 flex items-start gap-2">
                            <span className="text-green-500 mt-1">+</span>
                            {signal}
                          </li>
                        ))}
                      </ul>
                    </CollapsibleSection>
                  )}
                  
                  {/* Negative Signals */}
                  {property.negativeSignals.length > 0 && (
                    <CollapsibleSection title={`Concerns (${property.negativeSignals.length})`} defaultOpen={false}>
                      <ul className="space-y-1 pl-2">
                        {property.negativeSignals.map((signal, j) => (
                          <li key={j} className="text-sm text-red-700 flex items-start gap-2">
                            <span className="text-red-500 mt-1">−</span>
                            {signal}
                          </li>
                        ))}
                      </ul>
                    </CollapsibleSection>
                  )}
                  
                  {/* Questions Asked */}
                  {property.questionsAsked.length > 0 && (
                    <CollapsibleSection title={`Questions (${property.questionsAsked.length})`} defaultOpen={false}>
                      <ul className="space-y-1 pl-2">
                        {property.questionsAsked.map((q, j) => (
                          <li key={j} className="text-sm text-slate-600">• {q}</li>
                        ))}
                      </ul>
                    </CollapsibleSection>
                  )}
                </div>
                
                {/* Agent Recommendation */}
                <div className="mt-3 pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-2 text-sm">
                    <ArrowRight className="h-4 w-4 text-blue-500" />
                    <span className="font-medium text-blue-700">{property.agentRecommendation}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* SECTION D: Cross-Property Insights */}
      {report.crossPropertyInsights.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              Cross-Property Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {report.crossPropertyInsights.map((insight, i) => (
                <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="text-purple-500 mt-0.5">•</span>
                  {insight}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

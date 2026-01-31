import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import {
  MessageSquare,
  Mail,
  Check,
  AlertCircle,
  Copy,
  Zap,
  Target,
  Clock,
  FileText,
  Send,
  User,
  Phone,
  MapPin,
  DollarSign,
  Home,
  Calendar,
  Loader2,
  Rocket,
  Flame,
  Thermometer,
  Snowflake,
  PhoneCall,
  MessageCircle,
  CheckCircle2,
  Circle,
  MousePointerClick,
  HelpCircle,
  Eye,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import TaskQueue from "./task-queue";

// ============================================================================
// TYPES
// ============================================================================

interface LeadData {
  id: number;
  source: string;
  leadType: string;
  leadTypeReason: string;
  role: string;
  roleReason: string;
  intentScore: number;
  intentReasons: string[];
  extractionConfidence: number;
  rawInput: string;
  extractedName: string | null;
  extractedEmail: string | null;
  extractedPhone: string | null;
  extractedLocation: string | null;
  extractedBudget: string | null;
  extractedBudgetMin: number | null;
  extractedBudgetMax: number | null;
  extractedBedrooms: number | null;
  extractedBathrooms: string | null;
  extractedHomeType: string | null;
  extractedTimeline: string | null;
  hints: string[];
  whatToClarify: string[];
  suggestedMessage: string | null;
  clarifyingQuestion: string | null;
  propertyAddress: string | null;
  propertyListPrice: number | null;
  propertyBedrooms: number | null;
  propertyBathrooms: string | null;
  propertySqft: number | null;
  propertyImageUrl: string | null;
  createdAt: string;
  engagedAt: string | null;
  convertedAt: string | null;
  reportSentAt: string | null;
  reportShareId: string | null;
}

interface ProfileLeadResponse {
  hasLead: boolean;
  createdByMethod: string;
  lead?: LeadData;
}

interface ChatSessionSummary {
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

interface ChatInsights {
  riskTopicsDiscussed: string[];
  topQuestions: string[];
  objections: string[];
  suggestedAction: string;
  followUpMessage: string;
}

interface ChatSessionResponse {
  sessions: any[];
  hasSession: boolean;
  summary: ChatSessionSummary | null;
  insights: ChatInsights | null;
}

// Buyer insights types
interface NextStep {
  action: string;
  type: "property" | "pricing" | "negotiation" | "communication" | "showing";
  priority: "high" | "medium";
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

interface MustHaveItem {
  item: string;
  confidence: "Confirmed" | "Likely" | "Assumed";
}

interface BuyerInsightsReport {
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

interface BuyerInsightsResponse {
  profileId: number;
  hasData: boolean;
  report: BuyerInsightsReport;
  stats: {
    messagesAnalyzed: number;
    propertiesSaved: number;
  };
}

interface LeadIntelTabProps {
  profileId: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const sourceConfig: Record<string, { bg: string; text: string; label: string }> = {
  zillow: { bg: "bg-blue-100", text: "text-blue-800", label: "Zillow" },
  redfin: { bg: "bg-red-100", text: "text-red-800", label: "Redfin" },
  google: { bg: "bg-green-100", text: "text-green-800", label: "Google" },
  referral: { bg: "bg-purple-100", text: "text-purple-800", label: "Referral" },
  unknown: { bg: "bg-gray-100", text: "text-gray-800", label: "Direct" },
};

const leadTypeLabels: Record<string, string> = {
  property_specific: "Property Specific",
  area_search: "Area Search",
  general: "General Inquiry",
};

const getLeadTemperature = (intentScore: number) => {
  if (intentScore >= 60) return { label: "HOT", color: "bg-red-500", textColor: "text-red-700", bgLight: "bg-red-50", icon: Flame };
  if (intentScore >= 35) return { label: "WARM", color: "bg-amber-500", textColor: "text-amber-700", bgLight: "bg-amber-50", icon: Thermometer };
  return { label: "COLD", color: "bg-blue-400", textColor: "text-blue-700", bgLight: "bg-blue-50", icon: Snowflake };
};

const LEAD_STAGES = [
  { id: "new", label: "New", icon: Circle },
  { id: "contacted", label: "Contacted", icon: MessageCircle },
  { id: "qualified", label: "Qualified", icon: CheckCircle2 },
  { id: "showing", label: "Showing", icon: Home },
  { id: "offer", label: "Offer", icon: FileText },
  { id: "closed", label: "Closed", icon: CheckCircle2 },
];

// ============================================================================
// SECTION 1: LEAD STATUS BAR (Compact Header)
// ============================================================================

function LeadStatusBar({
  intentScore,
  stage,
  timeline,
  lastActive,
  onStageChange,
}: {
  intentScore: number;
  stage: string;
  timeline?: string | null;
  lastActive?: string | null;
  onStageChange?: (stage: string) => void;
}) {
  const temp = getLeadTemperature(intentScore);
  const TempIcon = temp.icon;
  const currentIndex = LEAD_STAGES.findIndex(s => s.id === stage);

  const formatLastActive = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };

  return (
    <Card className="border-slate-200 bg-gradient-to-r from-slate-50 to-white">
      <CardContent className="py-3 px-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Left: Temperature + Score + Timeline */}
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${temp.bgLight} border`}>
              <TempIcon className={`h-4 w-4 ${temp.textColor}`} />
              <span className={`font-bold ${temp.textColor}`}>{temp.label} LEAD</span>
              <span className="text-sm text-muted-foreground">({intentScore}/100)</span>
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="font-medium text-slate-700">Stage:</span>
                {LEAD_STAGES.find(s => s.id === stage)?.label || "New"}
              </span>
              {timeline && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {timeline}
                </span>
              )}
              {lastActive && (
                <span className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  Active {formatLastActive(lastActive)}
                </span>
              )}
            </div>
          </div>

          {/* Right: Stage Tracker (compact) */}
          <div className="flex items-center gap-1">
            {LEAD_STAGES.slice(0, 4).map((s, index) => {
              const isCompleted = index < currentIndex;
              const isCurrent = index === currentIndex;
              return (
                <button
                  key={s.id}
                  onClick={() => onStageChange?.(s.id)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                    isCompleted ? "bg-green-500 text-white" :
                    isCurrent ? "bg-blue-500 text-white ring-2 ring-blue-200" :
                    "bg-slate-200 text-slate-400"
                  }`}
                  title={s.label}
                >
                  {isCompleted ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SECTION 2: BUYER ACTIVITY FEED
// ============================================================================

function BuyerActivityFeed({
  chatSummary,
  insights,
  lead,
}: {
  chatSummary: ChatSessionSummary | null;
  insights: ChatInsights | null;
  lead: LeadData;
}) {
  const hasActivity = chatSummary && chatSummary.totalMessages > 0;
  const hasHighIntentSignals = chatSummary?.ctaClicked || (chatSummary?.engagementLevel === "HIGH");

  if (!hasActivity) {
    return (
      <Card className="border-dashed border-slate-300">
        <CardContent className="py-6 text-center">
          <MessageCircle className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-muted-foreground">No buyer activity yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Activity will appear once the buyer engages with the report
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={hasHighIntentSignals ? "border-green-200 bg-green-50/30" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Buyer Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* High Intent Signals */}
        {hasHighIntentSignals && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-green-700 uppercase tracking-wide flex items-center gap-1">
              <Flame className="h-3 w-3" />
              High Intent Signals
            </p>
            <div className="flex flex-wrap gap-2">
              {chatSummary?.ctaClicked && (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <MousePointerClick className="h-3 w-3 mr-1" />
                  Clicked "Schedule Showing" CTA
                </Badge>
              )}
              {chatSummary?.engagementLevel === "HIGH" && (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <MessageCircle className="h-3 w-3 mr-1" />
                  High Engagement ({chatSummary.totalMessages} messages)
                </Badge>
              )}
              {chatSummary?.readiness === "HIGH" && (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <Target className="h-3 w-3 mr-1" />
                  Ready to Buy
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Chat Summary */}
        <div className="flex items-center gap-3 text-sm">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <span>
            <strong>{chatSummary?.totalMessages}</strong> messages
            {chatSummary?.propertiesDiscussed?.length > 0 && (
              <> about <strong>{chatSummary.propertiesDiscussed.length}</strong> properties</>
            )}
          </span>
          <Badge variant="outline" className="text-xs">
            {chatSummary?.engagementLevel} engagement
          </Badge>
        </div>

        {/* Open Questions from Buyer */}
        {insights?.topQuestions && insights.topQuestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide flex items-center gap-1">
              <HelpCircle className="h-3 w-3" />
              Open Questions from Buyer
            </p>
            <div className="space-y-1.5 bg-slate-50 rounded-lg p-3">
              {insights.topQuestions.slice(0, 3).map((question, i) => (
                <p key={i} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="text-slate-400 mt-0.5">•</span>
                  "{question}"
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SECTION 3: AI RECOMMENDED ACTION (HERO SECTION)
// ============================================================================

function AIRecommendedAction({
  lead,
  chatSummary,
  chatInsights,
  buyerInsights,
  onCall,
  onText,
  onEmail,
}: {
  lead: LeadData;
  chatSummary: ChatSessionSummary | null;
  chatInsights: ChatInsights | null;
  buyerInsights: BuyerInsightsResponse | null;
  onCall: () => void;
  onText: () => void;
  onEmail: () => void;
}) {
  const { toast } = useToast();

  // Determine the recommended action
  const getRecommendedAction = () => {
    const ctaClicked = chatSummary?.ctaClicked;
    const highEngagement = chatSummary?.engagementLevel === "HIGH";
    const hasPhone = !!lead.extractedPhone;
    const hasEmail = !!lead.extractedEmail;

    // Priority 1: CTA clicked = call immediately
    if (ctaClicked && hasPhone) {
      return {
        action: "CALL",
        headline: `CALL ${lead.extractedName?.toUpperCase() || "BUYER"} NOW`,
        reason: "They clicked \"Schedule Showing\" and are actively engaged. Strike while the iron is hot!",
        urgency: "high",
      };
    }

    // Priority 2: High engagement
    if (highEngagement && hasPhone) {
      return {
        action: "CALL",
        headline: `CALL ${lead.extractedName?.toUpperCase() || "BUYER"}`,
        reason: `High engagement with ${chatSummary?.totalMessages} messages. They're interested and responsive.`,
        urgency: "high",
      };
    }

    // Priority 3: Has questions
    if (chatInsights?.topQuestions?.length && hasPhone) {
      return {
        action: "CALL",
        headline: `CALL TO ANSWER QUESTIONS`,
        reason: `They have ${chatInsights.topQuestions.length} unanswered questions. A quick call can address their concerns.`,
        urgency: "medium",
      };
    }

    // Priority 4: New lead - send text
    if (hasPhone) {
      return {
        action: "TEXT",
        headline: "SEND INTRO TEXT",
        reason: "Quick text introduction to start the conversation.",
        urgency: "medium",
      };
    }

    // Priority 5: Email only
    if (hasEmail) {
      return {
        action: "EMAIL",
        headline: "SEND EMAIL",
        reason: "No phone number available. Email to establish contact.",
        urgency: "low",
      };
    }

    return {
      action: "NONE",
      headline: "GATHER CONTACT INFO",
      reason: "No contact information available. Wait for buyer to provide details.",
      urgency: "low",
    };
  };

  const recommendation = getRecommendedAction();

  // Build talking points from available data
  const buildTalkingPoints = () => {
    const points: { label: string; value: string; icon: React.ReactNode }[] = [];

    // From chat questions
    if (chatInsights?.topQuestions?.[0]) {
      const question = chatInsights.topQuestions[0];
      if (question.toLowerCase().includes("school")) {
        points.push({
          label: "Schools",
          value: `They asked about schools - address their education concerns`,
          icon: <Target className="h-3.5 w-3.5" />,
        });
      }
      if (question.toLowerCase().includes("commute")) {
        points.push({
          label: "Commute",
          value: `They asked about commute - know the transit options`,
          icon: <Target className="h-3.5 w-3.5" />,
        });
      }
    }

    // Budget context
    const budgetStr = lead.extractedBudget ||
      (lead.extractedBudgetMax ? `Up to $${(lead.extractedBudgetMax / 1000).toFixed(0)}K` : null);
    const propertyPrice = lead.propertyListPrice ? `$${(lead.propertyListPrice / 1000).toFixed(0)}K` : null;

    if (budgetStr && propertyPrice) {
      const budgetNum = lead.extractedBudgetMax || 0;
      const priceNum = lead.propertyListPrice || 0;
      const overBudget = priceNum > budgetNum;
      points.push({
        label: "Budget",
        value: `Budget: ${budgetStr}, Property: ${propertyPrice}${overBudget ? " (discuss)" : ""}`,
        icon: <DollarSign className="h-3.5 w-3.5" />,
      });
    } else if (budgetStr) {
      points.push({
        label: "Budget",
        value: budgetStr,
        icon: <DollarSign className="h-3.5 w-3.5" />,
      });
    }

    // Timeline
    if (lead.extractedTimeline) {
      points.push({
        label: "Timeline",
        value: lead.extractedTimeline,
        icon: <Clock className="h-3.5 w-3.5" />,
      });
    }

    // Property details
    if (lead.propertyAddress) {
      const details = [
        lead.propertyBedrooms && `${lead.propertyBedrooms}BR`,
        lead.propertyBathrooms && `${lead.propertyBathrooms}BA`,
        lead.propertySqft && `${lead.propertySqft.toLocaleString()} sqft`,
      ].filter(Boolean).join(", ");

      points.push({
        label: "Property",
        value: `${lead.propertyAddress}${details ? ` - ${details}` : ""}`,
        icon: <Home className="h-3.5 w-3.5" />,
      });
    }

    // Buyer insights must-haves
    if (buyerInsights?.hasData && buyerInsights.report.mustHaves.length > 0) {
      const confirmed = buyerInsights.report.mustHaves
        .filter(m => m.confidence === "Confirmed")
        .map(m => m.item)
        .slice(0, 2);
      if (confirmed.length > 0) {
        points.push({
          label: "Must Have",
          value: confirmed.join(", "),
          icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        });
      }
    }

    return points;
  };

  const talkingPoints = buildTalkingPoints();

  // Generate suggested opener
  const generateOpener = () => {
    const name = lead.extractedName || "there";
    const address = lead.propertyAddress;
    const hasSchoolQuestion = chatInsights?.topQuestions?.some(q => q.toLowerCase().includes("school"));

    if (chatSummary?.ctaClicked && address) {
      return `"Hi ${name}, I saw you're interested in scheduling a showing for ${address}. I'd love to show you the property this week${hasSchoolQuestion ? " - it's in a great school district which I know is important to you" : ""}!"`;
    }

    if (address) {
      return `"Hi ${name}, I'm following up about ${address}. I have some additional information that might be helpful for you!"`;
    }

    return `"Hi ${name}, I'm following up on your inquiry. I'd love to help you find the perfect home. When would be a good time to chat?"`;
  };

  const handleCopyOpener = () => {
    navigator.clipboard.writeText(generateOpener().replace(/"/g, ''));
    toast({
      title: "Copied",
      description: "Opener copied to clipboard",
    });
  };

  const urgencyStyles = {
    high: "border-green-300 bg-gradient-to-br from-green-50 to-emerald-50",
    medium: "border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50",
    low: "border-slate-200 bg-slate-50",
  };

  return (
    <Card className={`${urgencyStyles[recommendation.urgency as keyof typeof urgencyStyles]} shadow-sm`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-slate-600">
          <Sparkles className="h-4 w-4 text-amber-500" />
          RECOMMENDED NEXT STEP
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Recommendation */}
        <div className="flex items-center gap-3">
          {recommendation.action === "CALL" && (
            <div className="p-3 rounded-full bg-green-500 text-white">
              <PhoneCall className="h-6 w-6" />
            </div>
          )}
          {recommendation.action === "TEXT" && (
            <div className="p-3 rounded-full bg-blue-500 text-white">
              <MessageCircle className="h-6 w-6" />
            </div>
          )}
          {recommendation.action === "EMAIL" && (
            <div className="p-3 rounded-full bg-purple-500 text-white">
              <Mail className="h-6 w-6" />
            </div>
          )}
          {recommendation.action === "NONE" && (
            <div className="p-3 rounded-full bg-slate-400 text-white">
              <AlertCircle className="h-6 w-6" />
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold text-slate-800">{recommendation.headline}</h3>
            <p className="text-sm text-muted-foreground">{recommendation.reason}</p>
          </div>
        </div>

        {/* Talking Points */}
        {talkingPoints.length > 0 && (
          <div className="bg-white/70 rounded-lg p-4 border border-slate-200">
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-3 flex items-center gap-1">
              <Target className="h-3 w-3" />
              Talking Points
            </p>
            <div className="space-y-2">
              {talkingPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-slate-400 mt-0.5">{point.icon}</span>
                  <span>
                    <strong className="text-slate-700">{point.label}:</strong>{" "}
                    <span className="text-slate-600">{point.value}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onCall}
            disabled={!lead.extractedPhone}
            className={`gap-2 ${recommendation.action === "CALL" ? "bg-green-600 hover:bg-green-700" : ""}`}
          >
            <PhoneCall className="h-4 w-4" />
            Call Now
          </Button>
          <Button
            onClick={onText}
            disabled={!lead.extractedPhone}
            variant={recommendation.action === "TEXT" ? "default" : "outline"}
            className={`gap-2 ${recommendation.action === "TEXT" ? "bg-blue-600 hover:bg-blue-700" : ""}`}
          >
            <MessageCircle className="h-4 w-4" />
            Send Text
          </Button>
          <Button
            onClick={onEmail}
            disabled={!lead.extractedEmail}
            variant={recommendation.action === "EMAIL" ? "default" : "outline"}
            className={`gap-2 ${recommendation.action === "EMAIL" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
          >
            <Mail className="h-4 w-4" />
            Email Instead
          </Button>
        </div>

        {/* Suggested Opener */}
        {recommendation.action !== "NONE" && (
          <div className="bg-slate-100 rounded-lg p-3 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-500">Suggested opener:</p>
              <Button variant="ghost" size="sm" onClick={handleCopyOpener} className="h-6 px-2 text-xs">
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <p className="text-sm text-slate-700 italic">{generateOpener()}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SECTION 4: DETAILS ACCORDION (Collapsible Secondary Info)
// ============================================================================

function DetailsAccordion({
  lead,
  chatData,
}: {
  lead: LeadData;
  chatData: ChatSessionResponse | null;
}) {
  const source = sourceConfig[lead.source?.toLowerCase()] || sourceConfig.unknown;

  return (
    <Accordion type="multiple" className="space-y-2">
      {/* Conversation History */}
      {chatData?.sessions && chatData.sessions.length > 0 && (
        <AccordionItem value="conversations" className="border rounded-lg px-4 bg-white">
          <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
            <span className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-slate-500" />
              Conversation History
              <Badge variant="secondary" className="text-xs">
                {chatData.summary?.totalMessages || 0} msgs
              </Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 text-sm pb-2">
              {chatData.sessions.slice(0, 3).map((session: any, i: number) => (
                <div key={i} className="p-2 bg-slate-50 rounded text-xs">
                  <p className="text-muted-foreground">
                    Session {i + 1} • {new Date(session.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
              {chatData.sessions.length > 3 && (
                <p className="text-xs text-muted-foreground">
                  + {chatData.sessions.length - 3} more sessions
                </p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      )}

      {/* Lead Profile */}
      <AccordionItem value="profile" className="border rounded-lg px-4 bg-white">
        <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
          <span className="flex items-center gap-2">
            <User className="h-4 w-4 text-slate-500" />
            Lead Profile
            <Badge className={`text-xs ${source.bg} ${source.text} border-0`}>
              {source.label}
            </Badge>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-2 gap-3 text-sm pb-2">
            {lead.extractedName && (
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedName}</span>
              </div>
            )}
            {lead.extractedEmail && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{lead.extractedEmail}</span>
              </div>
            )}
            {lead.extractedPhone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedPhone}</span>
              </div>
            )}
            {lead.extractedLocation && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedLocation}</span>
              </div>
            )}
            {(lead.extractedBudget || lead.extractedBudgetMax) && (
              <div className="flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {lead.extractedBudget ||
                    `Up to $${(lead.extractedBudgetMax! / 1000).toFixed(0)}K`}
                </span>
              </div>
            )}
            {lead.extractedBedrooms && (
              <div className="flex items-center gap-2">
                <Home className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedBedrooms}+ bedrooms</span>
              </div>
            )}
            {lead.extractedTimeline && (
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedTimeline}</span>
              </div>
            )}
          </div>

          {/* Lead type and role */}
          <div className="flex gap-2 mt-2 pt-2 border-t">
            <Badge variant="outline" className="text-xs">
              {leadTypeLabels[lead.leadType] || lead.leadType}
            </Badge>
            <Badge variant="secondary" className="text-xs capitalize">
              {lead.role?.replace("_", " ")}
            </Badge>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Original Message */}
      <AccordionItem value="message" className="border rounded-lg px-4 bg-white">
        <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-slate-500" />
            Original Lead Message
            <Badge variant="outline" className="text-xs">
              {lead.rawInput?.length || 0} chars
            </Badge>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="bg-slate-50 rounded-lg p-3 text-sm whitespace-pre-wrap">
            {lead.rawInput}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Activity Timeline */}
      <AccordionItem value="timeline" className="border rounded-lg px-4 bg-white">
        <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            Activity Timeline
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="relative space-y-3 pb-2">
            <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-200" />

            <TimelineItem
              icon={<MessageSquare className="h-3 w-3" />}
              title="Lead received"
              subtitle={`From ${source.label}`}
              date={lead.createdAt}
              color="blue"
            />

            {lead.convertedAt && (
              <TimelineItem
                icon={<User className="h-3 w-3" />}
                title="Profile created"
                subtitle="Lead converted to buyer profile"
                date={lead.convertedAt}
                color="green"
              />
            )}

            {lead.reportSentAt && (
              <TimelineItem
                icon={<FileText className="h-3 w-3" />}
                title="Buyer report emailed"
                subtitle={lead.extractedEmail ? `Sent to ${lead.extractedEmail}` : "Report sent"}
                date={lead.reportSentAt}
                color="purple"
              />
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Due Diligence Tasks */}
      {lead.reportShareId && (
        <AccordionItem value="tasks" className="border rounded-lg px-4 bg-white">
          <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-slate-500" />
              Due Diligence Tasks
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <TaskQueue leadId={lead.id} shareId={lead.reportShareId} />
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  );
}

// Timeline item component
function TimelineItem({
  icon,
  title,
  subtitle,
  date,
  color = "gray",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  date: string;
  color?: "blue" | "green" | "purple" | "gray";
}) {
  const colorClasses = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    purple: "bg-purple-100 text-purple-600",
    gray: "bg-gray-100 text-gray-600",
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="relative flex items-start gap-3 pl-6">
      <div className={`absolute left-0 w-4 h-4 rounded-full flex items-center justify-center ${colorClasses[color]}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <p className="text-xs text-muted-foreground whitespace-nowrap">
        {formatDate(date)}
      </p>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LeadIntelTab({ profileId }: LeadIntelTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false);
  const [leadStage, setLeadStage] = useState("new");

  // Fetch lead data
  const { data: leadData, isLoading } = useQuery<ProfileLeadResponse>({
    queryKey: [`/api/buyer-profiles/${profileId}/lead`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch chat session data
  const { data: chatData } = useQuery<ChatSessionResponse>({
    queryKey: [`/api/leads/${leadData?.lead?.id}/chat-sessions`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!leadData?.lead?.id && !!leadData?.lead?.reportShareId,
    staleTime: 60 * 1000,
  });

  // Fetch buyer insights
  const { data: buyerInsights } = useQuery<BuyerInsightsResponse>({
    queryKey: [`/api/buyer-insights/${profileId}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
  });

  // Outreach eligibility
  const outreachEligibility = useMemo(() => {
    if (!leadData?.lead) return { canGenerate: false, missing: [] };

    const lead = leadData.lead;
    const missing: string[] = [];

    if (lead.reportSentAt) {
      return { canGenerate: false, missing: [], alreadySent: true };
    }

    const hasEmail = !!lead.extractedEmail;
    const hasBudget = lead.extractedBudgetMin || lead.extractedBudgetMax || lead.propertyListPrice;
    if (!hasBudget) missing.push("budget");

    const hasLocation = lead.extractedLocation || lead.propertyAddress;
    if (!hasLocation) missing.push("location");

    return { canGenerate: missing.length === 0, missing, alreadySent: false, hasEmail };
  }, [leadData]);

  const handleGenerateOutreach = async () => {
    if (!leadData?.lead?.id) return;

    setIsGeneratingOutreach(true);
    try {
      const response = await apiRequest("POST", `/api/leads/${leadData.lead.id}/generate-outreach`, {});
      const data = await response.json();

      if (data.emailSent) {
        toast({
          title: "Report sent!",
          description: `Report with ${data.propertiesIncluded} properties emailed to ${data.emailSentTo}`,
        });
      } else {
        toast({
          title: "Report generated!",
          description: `Report with ${data.propertiesIncluded} properties ready to share.`,
        });
      }

      queryClient.invalidateQueries({ queryKey: [`/api/buyer-profiles/${profileId}/lead`] });

      if (data.reportUrl) {
        window.open(data.reportUrl, "_blank");
      }
    } catch (error: any) {
      toast({
        title: "Outreach failed",
        description: error?.message || "Failed to generate outreach",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingOutreach(false);
    }
  };

  // Action handlers
  const handleCall = () => {
    if (leadData?.lead?.extractedPhone) {
      window.open(`tel:${leadData.lead.extractedPhone}`);
      toast({ title: "Calling...", description: `Dialing ${leadData.lead.extractedPhone}` });
    }
  };

  const handleText = () => {
    if (leadData?.lead?.extractedPhone) {
      const message = encodeURIComponent(
        `Hi ${leadData.lead.extractedName || "there"}, following up on your property inquiry.`
      );
      window.open(`sms:${leadData.lead.extractedPhone}?body=${message}`);
    }
  };

  const handleEmail = () => {
    if (leadData?.lead?.extractedEmail) {
      const subject = encodeURIComponent("Following up on your property inquiry");
      window.open(`mailto:${leadData.lead.extractedEmail}?subject=${subject}`);
    }
  };

  const handleStageChange = (newStage: string) => {
    setLeadStage(newStage);
    toast({
      title: "Stage Updated",
      description: `Lead moved to "${LEAD_STAGES.find(s => s.id === newStage)?.label}"`,
    });
  };

  const getCurrentStage = () => {
    if (leadData?.lead?.reportSentAt) return "contacted";
    if (leadData?.lead?.convertedAt) return "new";
    return "new";
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // No lead data
  if (!leadData?.hasLead || !leadData.lead) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">
            Profile Created Manually
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            This buyer profile was created directly, not from a lead.
            Lead intelligence is only available for profiles converted from incoming leads.
          </p>
        </CardContent>
      </Card>
    );
  }

  const lead = leadData.lead;

  return (
    <div className="space-y-4">
      {/* Section 1: Lead Status Bar */}
      <LeadStatusBar
        intentScore={lead.intentScore}
        stage={getCurrentStage()}
        timeline={lead.extractedTimeline}
        lastActive={chatData?.summary?.lastActivity}
        onStageChange={handleStageChange}
      />

      {/* Generate Outreach CTA (if not sent) */}
      {!outreachEligibility.alreadySent && (
        <Card className={`${outreachEligibility.canGenerate ? "border-green-300 bg-green-50/50" : "border-amber-200 bg-amber-50/30"}`}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${outreachEligibility.canGenerate ? "bg-green-100" : "bg-amber-100"}`}>
                  <Rocket className={`h-5 w-5 ${outreachEligibility.canGenerate ? "text-green-600" : "text-amber-600"}`} />
                </div>
                <div>
                  <h3 className="font-medium text-sm">
                    {outreachEligibility.hasEmail ? "One-Click Outreach" : "Generate Report"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {!outreachEligibility.canGenerate
                      ? `Missing: ${outreachEligibility.missing.join(", ")}`
                      : outreachEligibility.hasEmail
                        ? "Search, generate, and email automatically"
                        : "Generate shareable report"}
                  </p>
                </div>
              </div>
              <Button
                onClick={handleGenerateOutreach}
                disabled={isGeneratingOutreach || !outreachEligibility.canGenerate}
                size="sm"
                className={outreachEligibility.canGenerate ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {isGeneratingOutreach ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-1" />
                    {outreachEligibility.hasEmail ? "Generate & Send" : "Generate"}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Sent Notice */}
      {outreachEligibility.alreadySent && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100">
                  <Check className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-medium text-sm text-purple-700">Report Sent</h3>
                  <p className="text-xs text-muted-foreground">
                    {lead.extractedEmail
                      ? `Emailed on ${new Date(lead.reportSentAt!).toLocaleDateString()}`
                      : `Created on ${new Date(lead.reportSentAt!).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              {lead.reportShareId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/buyer-report/${lead.reportShareId}`, "_blank")}
                >
                  View Report
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 2: Buyer Activity Feed */}
      {outreachEligibility.alreadySent && (
        <BuyerActivityFeed
          chatSummary={chatData?.summary || null}
          insights={chatData?.insights || null}
          lead={lead}
        />
      )}

      {/* Section 3: AI Recommended Action (THE HERO) */}
      {outreachEligibility.alreadySent && (
        <AIRecommendedAction
          lead={lead}
          chatSummary={chatData?.summary || null}
          chatInsights={chatData?.insights || null}
          buyerInsights={buyerInsights || null}
          onCall={handleCall}
          onText={handleText}
          onEmail={handleEmail}
        />
      )}

      {/* Section 4: Collapsible Details */}
      <DetailsAccordion lead={lead} chatData={chatData || null} />
    </div>
  );
}

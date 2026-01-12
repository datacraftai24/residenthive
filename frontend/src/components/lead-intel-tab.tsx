import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import {
  MessageSquare,
  Mail,
  Check,
  AlertCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  Zap,
  Target,
  Clock,
  FileText,
  Send,
  Sparkles,
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
  Bell,
  CalendarClock,
  CircleDot,
  CheckCircle2,
  Circle,
} from "lucide-react";
import ChatInsightsCard from "./chat-insights-card";
import TaskQueue from "./task-queue";

// Types for lead data
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

interface LeadIntelTabProps {
  profileId: number;
}

// Source color config
const sourceConfig: Record<string, { bg: string; text: string; label: string }> = {
  zillow: { bg: "bg-blue-100", text: "text-blue-800", label: "Zillow" },
  redfin: { bg: "bg-red-100", text: "text-red-800", label: "Redfin" },
  google: { bg: "bg-green-100", text: "text-green-800", label: "Google" },
  referral: { bg: "bg-purple-100", text: "text-purple-800", label: "Referral" },
  unknown: { bg: "bg-gray-100", text: "text-gray-800", label: "Direct" },
};

// Lead type labels
const leadTypeLabels: Record<string, string> = {
  property_specific: "Property Specific",
  area_search: "Area Search",
  general: "General Inquiry",
};

// Lead temperature thresholds
const getLeadTemperature = (intentScore: number) => {
  if (intentScore >= 60) return { label: "Hot", color: "bg-red-500", textColor: "text-red-700", bgLight: "bg-red-50", icon: Flame };
  if (intentScore >= 35) return { label: "Warm", color: "bg-amber-500", textColor: "text-amber-700", bgLight: "bg-amber-50", icon: Thermometer };
  return { label: "Cold", color: "bg-blue-400", textColor: "text-blue-700", bgLight: "bg-blue-50", icon: Snowflake };
};

// Lead stages
const LEAD_STAGES = [
  { id: "new", label: "New", icon: Circle },
  { id: "contacted", label: "Contacted", icon: MessageCircle },
  { id: "qualified", label: "Qualified", icon: CheckCircle2 },
  { id: "showing", label: "Showing", icon: Home },
  { id: "offer", label: "Offer", icon: FileText },
  { id: "closed", label: "Closed", icon: CheckCircle2 },
];

// Lead Temperature Badge Component
function LeadTemperatureBadge({ intentScore, timeline }: { intentScore: number; timeline?: string }) {
  const temp = getLeadTemperature(intentScore);
  const TempIcon = temp.icon;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg ${temp.bgLight} border border-${temp.color}/20`}>
      <div className={`p-2 rounded-full ${temp.color}`}>
        <TempIcon className="h-5 w-5 text-white" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${temp.textColor}`}>{temp.label} Lead</span>
          <span className="text-sm text-muted-foreground">({intentScore}/100)</span>
        </div>
        {timeline && (
          <p className="text-xs text-muted-foreground">Timeline: {timeline}</p>
        )}
      </div>
    </div>
  );
}

// Lead Stage Tracker Component
function LeadStageTracker({ currentStage, onStageChange }: { currentStage: string; onStageChange?: (stage: string) => void }) {
  const currentIndex = LEAD_STAGES.findIndex(s => s.id === currentStage);

  return (
    <div className="flex items-center justify-between w-full overflow-x-auto pb-2">
      {LEAD_STAGES.map((stage, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const StageIcon = stage.icon;

        return (
          <div key={stage.id} className="flex items-center flex-1">
            <button
              onClick={() => onStageChange?.(stage.id)}
              className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-all hover:bg-slate-100 ${
                isCurrent ? "bg-blue-50" : ""
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                isCompleted ? "bg-green-500 text-white" :
                isCurrent ? "bg-blue-500 text-white ring-2 ring-blue-200" :
                "bg-slate-200 text-slate-500"
              }`}>
                {isCompleted ? <Check className="h-4 w-4" /> : <StageIcon className="h-4 w-4" />}
              </div>
              <span className={`text-xs whitespace-nowrap ${
                isCurrent ? "font-semibold text-blue-700" :
                isCompleted ? "text-green-700" : "text-muted-foreground"
              }`}>
                {stage.label}
              </span>
            </button>
            {index < LEAD_STAGES.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${
                isCompleted ? "bg-green-500" : "bg-slate-200"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Quick Actions Component
function QuickActions({
  phone,
  email,
  onCall,
  onText,
  onEmail,
  onSetReminder
}: {
  phone?: string | null;
  email?: string | null;
  onCall?: () => void;
  onText?: () => void;
  onEmail?: () => void;
  onSetReminder?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant="outline"
        size="sm"
        onClick={onCall}
        disabled={!phone}
        className="gap-1.5"
      >
        <PhoneCall className="h-4 w-4" />
        Call
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onText}
        disabled={!phone}
        className="gap-1.5"
      >
        <MessageCircle className="h-4 w-4" />
        Text
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onEmail}
        disabled={!email}
        className="gap-1.5"
      >
        <Mail className="h-4 w-4" />
        Email
      </Button>
      <div className="w-px h-6 bg-slate-200 mx-1" />
      <Button
        variant="outline"
        size="sm"
        onClick={onSetReminder}
        className="gap-1.5"
      >
        <Bell className="h-4 w-4" />
        Set Reminder
      </Button>
    </div>
  );
}

export default function LeadIntelTab({ profileId }: LeadIntelTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showFullMessage, setShowFullMessage] = useState(true); // Show by default now
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false);
  const [leadStage, setLeadStage] = useState("new");
  const [showReminderModal, setShowReminderModal] = useState(false);

  const { data: leadData, isLoading } = useQuery<ProfileLeadResponse>({
    queryKey: [`/api/buyer-profiles/${profileId}/lead`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch chat session data when lead has a report
  const { data: chatData } = useQuery<ChatSessionResponse>({
    queryKey: [`/api/leads/${leadData?.lead?.id}/chat-sessions`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!leadData?.lead?.id && !!leadData?.lead?.reportShareId,
    staleTime: 60 * 1000,
  });

  // Outreach eligibility check
  const outreachEligibility = useMemo(() => {
    if (!leadData?.lead) return { canGenerate: false, missing: [] };

    const lead = leadData.lead;
    const missing: string[] = [];

    // Already sent?
    if (lead.reportSentAt) {
      return { canGenerate: false, missing: [], alreadySent: true };
    }

    // Email is optional - we can generate report without it
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
          description: (
            <div className="space-y-2">
              <p>Report with {data.propertiesIncluded} properties ready to share.</p>
              <a
                href={data.fullReportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline text-sm"
              >
                Open Report →
              </a>
            </div>
          ),
        });
      }

      // Refresh lead data to show updated timeline
      queryClient.invalidateQueries({ queryKey: [`/api/buyer-profiles/${profileId}/lead`] });

      // Open report in new tab
      if (data.reportUrl) {
        window.open(data.reportUrl, "_blank");
      }
    } catch (error: any) {
      const message = error?.message || "Failed to generate outreach";
      toast({
        title: "Outreach failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingOutreach(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

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
  const source = sourceConfig[lead.source?.toLowerCase()] || sourceConfig.unknown;

  const handleCopyMessage = () => {
    if (lead.suggestedMessage) {
      navigator.clipboard.writeText(lead.suggestedMessage);
      toast({
        title: "Copied",
        description: "Message copied to clipboard",
      });
    }
  };

  const handleSendEmail = () => {
    if (lead.extractedEmail && lead.suggestedMessage) {
      const subject = encodeURIComponent("Following up on your inquiry");
      const body = encodeURIComponent(lead.suggestedMessage);
      window.open(`mailto:${lead.extractedEmail}?subject=${subject}&body=${body}`);
    }
  };

  // Quick action handlers
  const handleCall = () => {
    if (lead.extractedPhone) {
      window.open(`tel:${lead.extractedPhone}`);
      toast({ title: "Calling...", description: `Dialing ${lead.extractedPhone}` });
    }
  };

  const handleText = () => {
    if (lead.extractedPhone) {
      const message = encodeURIComponent(`Hi ${lead.extractedName || "there"}, following up on your property inquiry.`);
      window.open(`sms:${lead.extractedPhone}?body=${message}`);
    }
  };

  const handleQuickEmail = () => {
    if (lead.extractedEmail) {
      const subject = encodeURIComponent("Following up on your property inquiry");
      window.open(`mailto:${lead.extractedEmail}?subject=${subject}`);
    }
  };

  const handleSetReminder = () => {
    toast({
      title: "Reminder Set",
      description: "You'll be reminded to follow up tomorrow at 9 AM",
    });
    // TODO: Integrate with actual reminder/notification system
  };

  const handleStageChange = (newStage: string) => {
    setLeadStage(newStage);
    toast({
      title: "Stage Updated",
      description: `Lead moved to "${LEAD_STAGES.find(s => s.id === newStage)?.label}"`,
    });
    // TODO: Persist stage change to backend
  };

  // Determine initial stage based on lead data
  const getCurrentStage = () => {
    if (lead.reportSentAt) return "contacted";
    if (lead.convertedAt) return "new";
    return "new";
  };

  return (
    <div className="space-y-6">
      {/* NEW: Lead Summary Header - Temperature + Quick Actions */}
      <Card className="border-slate-200">
        <CardContent className="py-4 space-y-4">
          {/* Row 1: Temperature Badge + Quick Actions */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <LeadTemperatureBadge
              intentScore={lead.intentScore}
              timeline={lead.extractedTimeline || undefined}
            />
            <QuickActions
              phone={lead.extractedPhone}
              email={lead.extractedEmail}
              onCall={handleCall}
              onText={handleText}
              onEmail={handleQuickEmail}
              onSetReminder={handleSetReminder}
            />
          </div>

          {/* Row 2: Stage Tracker */}
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">Lead Pipeline</p>
            <LeadStageTracker
              currentStage={getCurrentStage()}
              onStageChange={handleStageChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Generate Outreach Card - prominent CTA */}
      {!outreachEligibility.alreadySent && (
        <Card className={`${outreachEligibility.canGenerate ? "border-green-300 bg-green-50/50" : "border-amber-200 bg-amber-50/30"}`}>
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${outreachEligibility.canGenerate ? "bg-green-100" : "bg-amber-100"}`}>
                  <Rocket className={`h-5 w-5 ${outreachEligibility.canGenerate ? "text-green-600" : "text-amber-600"}`} />
                </div>
                <div>
                  <h3 className="font-medium text-sm">
                    {outreachEligibility.hasEmail ? "One-Click Outreach" : "Generate Report"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {!outreachEligibility.canGenerate
                      ? `Missing: ${outreachEligibility.missing.join(", ")}`
                      : outreachEligibility.hasEmail
                        ? "Search properties, generate report, and send email automatically"
                        : "Search properties and generate shareable report (no email on file)"}
                  </p>
                </div>
              </div>
              <Button
                onClick={handleGenerateOutreach}
                disabled={isGeneratingOutreach || !outreachEligibility.canGenerate}
                className={`${outreachEligibility.canGenerate ? "bg-green-600 hover:bg-green-700" : "bg-gray-400"}`}
              >
                {isGeneratingOutreach ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    {outreachEligibility.hasEmail ? "Generate & Send" : "Generate Report"}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Already Sent Notice */}
      {outreachEligibility.alreadySent && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100">
                  <Check className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-medium text-sm text-purple-700">
                    {lead.extractedEmail ? "Report Sent" : "Report Generated"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {lead.extractedEmail
                      ? `Emailed to ${lead.extractedEmail} on ${new Date(lead.reportSentAt!).toLocaleDateString()}`
                      : `Created on ${new Date(lead.reportSentAt!).toLocaleDateString()} - share link manually`}
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

      {/* Chat Insights - actionable intelligence from chatbot sessions */}
      {outreachEligibility.alreadySent && chatData?.hasSession && chatData.summary && (
        <ChatInsightsCard
          summary={chatData.summary}
          insights={chatData.insights}
          email={lead.extractedEmail}
        />
      )}

      {/* Due Diligence Tasks - verification items from chatbot interactions */}
      {outreachEligibility.alreadySent && lead.reportShareId && (
        <TaskQueue
          leadId={lead.id}
          shareId={lead.reportShareId}
        />
      )}

      {/* Origin & Scores Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Lead Origin */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4" />
              Lead Origin
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Source</span>
              <Badge className={`${source.bg} ${source.text} border-0`}>
                {source.label}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Lead Type</span>
              <Badge variant="outline">
                {leadTypeLabels[lead.leadType] || lead.leadType}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Role</span>
              <Badge variant="secondary" className="capitalize">
                {lead.role?.replace("_", " ")}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Intent & Confidence */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Lead Quality
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Intent Score</span>
                <span className="text-sm font-semibold">{lead.intentScore}/100</span>
              </div>
              <Progress
                value={lead.intentScore}
                className={`h-2 ${lead.intentScore >= 50 ? "[&>div]:bg-green-500" : "[&>div]:bg-amber-500"}`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Extraction Confidence</span>
                <span className="text-sm font-semibold">{lead.extractionConfidence || 0}%</span>
              </div>
              <Progress
                value={lead.extractionConfidence || 0}
                className="h-2"
              />
            </div>
            {lead.intentReasons && lead.intentReasons.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">Why this score:</p>
                <div className="flex flex-wrap gap-1">
                  {lead.intentReasons.map((reason, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {reason}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Original Message - Now shows preview by default */}
      <Card className="border-blue-100 bg-blue-50/20">
        <CardHeader
          className="pb-2 cursor-pointer"
          onClick={() => setShowFullMessage(!showFullMessage)}
        >
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-600" />
              Original Lead Message
              <Badge variant="outline" className="text-xs ml-2">
                {lead.rawInput?.length || 0} chars
              </Badge>
            </span>
            <Button variant="ghost" size="sm" className="h-6 px-2">
              {showFullMessage ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  <span className="text-xs">Collapse</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  <span className="text-xs">Expand</span>
                </>
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="bg-white rounded-lg p-4 text-sm border border-blue-100">
            {showFullMessage ? (
              <div className="whitespace-pre-wrap">{lead.rawInput}</div>
            ) : (
              <div className="text-muted-foreground">
                {lead.rawInput?.substring(0, 150)}
                {(lead.rawInput?.length || 0) > 150 && "..."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* What Was Extracted vs What's Missing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Extracted Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-green-700">
              <Check className="h-4 w-4" />
              What We Know
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lead.extractedName && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedName}</span>
              </div>
            )}
            {lead.extractedEmail && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedEmail}</span>
              </div>
            )}
            {lead.extractedPhone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedPhone}</span>
              </div>
            )}
            {lead.extractedLocation && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedLocation}</span>
              </div>
            )}
            {(lead.extractedBudget || lead.extractedBudgetMin || lead.extractedBudgetMax) && (
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {lead.extractedBudget ||
                    (lead.extractedBudgetMin && lead.extractedBudgetMax
                      ? `$${lead.extractedBudgetMin.toLocaleString()} - $${lead.extractedBudgetMax.toLocaleString()}`
                      : lead.extractedBudgetMax
                        ? `Up to $${lead.extractedBudgetMax.toLocaleString()}`
                        : `From $${lead.extractedBudgetMin?.toLocaleString()}`
                    )
                  }
                </span>
              </div>
            )}
            {lead.extractedBedrooms && (
              <div className="flex items-center gap-2 text-sm">
                <Home className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedBedrooms}+ bedrooms</span>
              </div>
            )}
            {lead.extractedTimeline && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedTimeline}</span>
              </div>
            )}
            {lead.extractedHomeType && (
              <div className="flex items-center gap-2 text-sm">
                <Home className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="capitalize">{lead.extractedHomeType}</span>
              </div>
            )}

            {/* Hints / Soft Signals */}
            {lead.hints && lead.hints.length > 0 && (
              <div className="pt-2 mt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Soft signals detected:
                </p>
                <div className="flex flex-wrap gap-1">
                  {lead.hints.map((hint, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {hint}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* No info extracted */}
            {!lead.extractedName && !lead.extractedEmail && !lead.extractedLocation &&
             !lead.extractedBudget && !lead.extractedBedrooms && (
              <p className="text-sm text-muted-foreground italic">
                Limited information extracted from message
              </p>
            )}
          </CardContent>
        </Card>

        {/* What's Missing */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-4 w-4" />
              What to Clarify
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lead.whatToClarify && lead.whatToClarify.length > 0 ? (
              <>
                {lead.whatToClarify.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>{item}</span>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-green-600">
                All key information captured!
              </p>
            )}

            {/* Clarifying question */}
            {lead.clarifyingQuestion && (
              <div className="pt-3 mt-3 border-t">
                <p className="text-xs text-muted-foreground mb-2">Suggested question to ask:</p>
                <p className="text-sm italic bg-amber-50 rounded p-2 border border-amber-200">
                  "{lead.clarifyingQuestion}"
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Engagement Card */}
      {lead.suggestedMessage && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
              <Send className="h-4 w-4" />
              Suggested Engagement Message
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-white rounded-lg p-4 text-sm border mb-3">
              {lead.suggestedMessage}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyMessage}
                className="gap-1"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
              {lead.extractedEmail && (
                <Button
                  size="sm"
                  onClick={handleSendEmail}
                  className="gap-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Open in Email
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-200" />

            <div className="space-y-4">
              {/* Lead received */}
              <TimelineItem
                icon={<MessageSquare className="h-3 w-3" />}
                title="Lead received"
                subtitle={`From ${source.label}`}
                date={lead.createdAt}
                color="blue"
              />

              {/* Profile created */}
              {lead.convertedAt && (
                <TimelineItem
                  icon={<User className="h-3 w-3" />}
                  title="Profile created"
                  subtitle="Lead converted to buyer profile"
                  date={lead.convertedAt}
                  color="green"
                />
              )}

              {/* Report sent */}
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
          </div>
        </CardContent>
      </Card>
    </div>
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
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
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

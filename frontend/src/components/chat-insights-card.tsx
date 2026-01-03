import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle,
  AlertTriangle,
  Target,
  Copy,
  Mail,
  Home,
  DollarSign,
  Bed,
  MapPin,
  HelpCircle,
  CheckCircle,
} from "lucide-react";

interface ChatSummary {
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

interface ChatInsightsCardProps {
  summary: ChatSummary;
  insights: ChatInsights | null;
  email?: string | null;
  compact?: boolean;
}

const engagementColors: Record<string, string> = {
  HIGH: "bg-green-100 text-green-800 border-green-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
};

const readinessColors: Record<string, string> = {
  HIGH: "bg-green-600",
  MEDIUM: "bg-amber-500",
  LOW: "bg-slate-400",
};

export default function ChatInsightsCard({
  summary,
  insights,
  email,
  compact = false,
}: ChatInsightsCardProps) {
  const { toast } = useToast();
  const [copiedMessage, setCopiedMessage] = useState(false);

  const handleCopyMessage = () => {
    if (insights?.followUpMessage) {
      navigator.clipboard.writeText(insights.followUpMessage);
      setCopiedMessage(true);
      toast({
        title: "Copied",
        description: "Follow-up message copied to clipboard",
      });
      setTimeout(() => setCopiedMessage(false), 2000);
    }
  };

  const handleSendEmail = () => {
    if (email && insights?.followUpMessage) {
      const subject = encodeURIComponent("Following up on your home search");
      const body = encodeURIComponent(insights.followUpMessage);
      window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    }
  };

  const hasPreferences = Object.keys(summary.preferences || {}).length > 0;
  const hasRiskTopics = insights?.riskTopicsDiscussed && insights.riskTopicsDiscussed.length > 0;
  const hasQuestions = insights?.topQuestions && insights.topQuestions.length > 0;
  const hasObjections = insights?.objections && insights.objections.length > 0;
  const hasPropertiesDiscussed = summary.propertiesDiscussed && summary.propertiesDiscussed.length > 0;

  if (summary.totalMessages === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center">
          <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No chat activity yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Card - Engagement & Readiness */}
      <Card className={summary.engagementLevel === "HIGH" ? "border-green-200 bg-green-50/30" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Chat Engagement
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge className={engagementColors[summary.engagementLevel] || engagementColors.LOW}>
                {summary.engagementLevel}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {summary.totalMessages} msgs
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Buyer Readiness</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${readinessColors[summary.readiness] || readinessColors.LOW}`}
                  style={{
                    width: summary.readiness === "HIGH" ? "100%" : summary.readiness === "MEDIUM" ? "60%" : "30%",
                  }}
                />
              </div>
              <span className="font-medium">{summary.readiness}</span>
            </div>
          </div>
          {summary.ctaClicked && (
            <div className="mt-2 flex items-center gap-1 text-green-600 text-sm">
              <CheckCircle className="h-4 w-4" />
              <span>CTA Clicked - Ready to engage</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Captured Preferences */}
      {hasPreferences && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
              <Target className="h-4 w-4" />
              Captured Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {summary.preferences.bedrooms && (
                <div className="flex items-center gap-2">
                  <Bed className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{summary.preferences.bedrooms}+ bedrooms</span>
                </div>
              )}
              {(summary.preferences.budget_max || summary.preferences.budget_min) && (
                <div className="flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>
                    {summary.preferences.budget_min && summary.preferences.budget_max
                      ? `$${(summary.preferences.budget_min / 1000).toFixed(0)}k - $${(summary.preferences.budget_max / 1000).toFixed(0)}k`
                      : summary.preferences.budget_max
                        ? `Up to $${(summary.preferences.budget_max / 1000).toFixed(0)}k`
                        : `From $${(summary.preferences.budget_min / 1000).toFixed(0)}k`}
                  </span>
                </div>
              )}
              {summary.preferences.home_type && (
                <div className="flex items-center gap-2">
                  <Home className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="capitalize">{summary.preferences.home_type.replace("_", " ")}</span>
                </div>
              )}
              {summary.preferences.priority && (
                <div className="flex items-center gap-2">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Priority: {summary.preferences.priority}</span>
                </div>
              )}
              {summary.preferences.preferred_locations && summary.preferences.preferred_locations.length > 0 && (
                <div className="flex items-center gap-2 col-span-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{summary.preferences.preferred_locations.join(", ")}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Properties Discussed */}
      {hasPropertiesDiscussed && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Home className="h-4 w-4" />
              Properties Discussed
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {summary.propertiesDiscussed.map((mlsNumber, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  MLS# {mlsNumber}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Topics - Highlighted with Warning */}
      {hasRiskTopics && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              Risk Topics - Requires Verification
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {insights!.riskTopicsDiscussed.map((topic, i) => (
                <Badge key={i} variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                  {topic}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-amber-600 mt-2">
              Buyer asked about these sensitive topics. Verify details before responding.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Top Questions */}
      {hasQuestions && !compact && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              Top Questions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1 text-sm">
              {insights!.topQuestions.slice(0, 3).map((question, i) => (
                <li key={i} className="text-muted-foreground">
                  "{question}"
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Suggested Action */}
      {insights?.suggestedAction && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
              <Target className="h-4 w-4" />
              Suggested Action
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm">{insights.suggestedAction}</p>
          </CardContent>
        </Card>
      )}

      {/* Follow-up Message */}
      {insights?.followUpMessage && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-green-700">
              <Mail className="h-4 w-4" />
              Ready to Send
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="bg-white rounded p-3 text-sm border mb-3 whitespace-pre-wrap">
              {insights.followUpMessage}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyMessage}
                className="gap-1"
              >
                {copiedMessage ? (
                  <>
                    <CheckCircle className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </Button>
              {email && (
                <Button
                  size="sm"
                  onClick={handleSendEmail}
                  className="gap-1 bg-green-600 hover:bg-green-700"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

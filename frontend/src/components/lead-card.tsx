import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Copy, Info, UserPlus, Zap, Loader2, ExternalLink, Mail, CheckCircle, MessageCircle, MousePointerClick } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { OutreachModal } from "./outreach-modal";

interface ChatSessionSummary {
  totalSessions: number;
  totalMessages: number;
  ctaShown: boolean;
  ctaClicked: boolean;
  hasEngaged: boolean;
}

interface LeadCardData {
  classification: {
    role: string;
    roleReason: string;
    leadType: string;
    leadTypeReason: string;
  };
  intentScore: number;
  intentReasons: string[];
  whatToClarify: string[];
  suggestedMessage: string;
  clarifyingQuestion: string | null;
  mlsSearchStatus: string | null;
  mlsMatches: any[] | null;
  extractionConfidence: number;
}

interface LeadEligibility {
  extractedEmail: string | null;
  extractedBudgetMin: number | null;
  extractedBudgetMax: number | null;
  propertyListPrice: number | null;
  extractedLocation: string | null;
  propertyAddress: string | null;
  reportShareId: string | null;
  reportSentAt: string | null;
  emailSentAt: string | null;
}

interface LeadCardProps {
  leadId: number;
  card: LeadCardData;
  leadEligibility?: LeadEligibility;
  onSaveAsProfile: () => void;
  onOutreachGenerated?: (reportUrl: string) => void;
  isConverting?: boolean;
  isConverted?: boolean;
}

function getIntentLabel(score: number): string {
  if (score >= 60) return "High";
  if (score >= 30) return "Medium";
  return "Low";
}

function getIntentVariant(score: number): "default" | "secondary" | "destructive" | "outline" {
  if (score >= 60) return "default";
  if (score >= 30) return "secondary";
  return "outline";
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "destructive" | "outline" {
  switch (role) {
    case "buyer_lead":
      return "default";
    case "investor":
      return "secondary";
    case "agent":
      return "outline";
    default:
      return "outline";
  }
}

export default function LeadCard({ leadId, card, leadEligibility, onSaveAsProfile, onOutreachGenerated }: LeadCardProps) {
  const { toast } = useToast();
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSent, setEmailSent] = useState(!!leadEligibility?.emailSentAt);
  const [currentReportShareId, setCurrentReportShareId] = useState(leadEligibility?.reportShareId || null);
  const [chatSummary, setChatSummary] = useState<ChatSessionSummary | null>(null);

  // Fetch chat session data when report exists
  useEffect(() => {
    if (currentReportShareId) {
      apiRequest("GET", `/api/leads/${leadId}/chat-sessions`)
        .then(res => res.json())
        .then(data => {
          if (data.summary) {
            setChatSummary(data.summary);
          }
        })
        .catch(err => console.error("Failed to fetch chat sessions:", err));
    }
  }, [leadId, currentReportShareId]);

  // Check if lead is eligible for one-click outreach
  const outreachEligibility = useMemo(() => {
    const missing: string[] = [];

    if (!leadEligibility) {
      return { canGenerate: false, missing: ["Lead data not available"], hasEmail: false };
    }

    // Email is optional - we can generate report without it
    const hasEmail = !!leadEligibility.extractedEmail;

    // Must have budget info (explicit or from property)
    const hasBudget =
      leadEligibility.extractedBudgetMin ||
      leadEligibility.extractedBudgetMax ||
      leadEligibility.propertyListPrice;
    if (!hasBudget) {
      missing.push("budget");
    }

    // Must have location
    const hasLocation =
      leadEligibility.extractedLocation ||
      leadEligibility.propertyAddress;
    if (!hasLocation) {
      missing.push("location");
    }

    return { canGenerate: missing.length === 0, missing, hasEmail };
  }, [leadEligibility]);

  const canGenerateOutreach = outreachEligibility.canGenerate;

  const handleGenerateOutreach = async () => {
    setIsGeneratingOutreach(true);
    try {
      // Don't send email automatically - agent will review and send separately
      const response = await apiRequest("POST", `/api/leads/${leadId}/generate-outreach?send_email=false`, {});
      const data = await response.json();

      toast({
        title: "Report generated!",
        description: `Report with ${data.propertiesIncluded} properties ready for review.`,
      });

      // Store the report share ID for displaying link and send button
      if (data.reportShareId) {
        setCurrentReportShareId(data.reportShareId);
      }

      // Open report in new tab for agent review
      if (data.reportUrl) {
        window.open(data.reportUrl, "_blank");
      }

      // Notify parent
      if (onOutreachGenerated && data.reportUrl) {
        onOutreachGenerated(data.reportUrl);
      }
    } catch (error: any) {
      const message = error?.message || "Failed to generate report. Please try again.";
      toast({
        title: "Report generation failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingOutreach(false);
    }
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(card.suggestedMessage);

      // Mark lead as engaged (silent API call)
      await apiRequest("PATCH", `/api/leads/${leadId}/status`, {
        status: "engaged",
      });

      toast({
        title: "Copied",
        description: "Lead marked as engaged.",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy message to clipboard.",
        variant: "destructive",
      });
    }
  };

  const isBuyerLead = card.classification.role === "buyer_lead";
  const isInvestor = card.classification.role === "investor";
  const isNonBuyer = card.classification.role === "agent" || card.classification.role === "unknown";

  return (
    <div className="space-y-4">
      {/* What We Detected */}
      <Card className="bg-slate-50">
        <CardHeader className="pb-2">
          <span className="text-sm text-muted-foreground">What we detected</span>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-center">
            <Badge variant={getRoleBadgeVariant(card.classification.role)}>
              {card.classification.role.replace("_", " ").toUpperCase()}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {card.classification.leadType.replace("_", " ")}
            </span>
          </div>
          <p className="text-sm mt-2 text-muted-foreground">
            {card.classification.roleReason}
          </p>
        </CardContent>
      </Card>

      {/* Intent Score */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{card.intentScore}</span>
            <span className="text-muted-foreground">/ 100</span>
            <Badge variant={getIntentVariant(card.intentScore)}>
              {getIntentLabel(card.intentScore)}
            </Badge>
          </div>
          {card.intentReasons.length > 0 && (
            <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside">
              {card.intentReasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* What to Clarify Next */}
      {card.whatToClarify.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="text-sm font-medium mb-2">What to clarify next</h4>
            <div className="flex flex-wrap gap-1">
              {card.whatToClarify.map((item, i) => (
                <Badge key={i} variant="outline" className="text-amber-600 border-amber-300">
                  {item}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* MLS Search Status (Area Search) */}
      {card.classification.leadType === "area_search" && card.mlsSearchStatus === "skipped_no_constraints" && (
        <Alert variant="default" className="bg-slate-50">
          <Info className="h-4 w-4" />
          <AlertTitle>Not enough info to suggest properties yet</AlertTitle>
          <AlertDescription>
            Once we know their budget or bedroom needs, we can show matching listings.
          </AlertDescription>
        </Alert>
      )}

      {card.classification.leadType === "area_search" && card.mlsSearchStatus === "performed" && card.mlsMatches && (
        <Card>
          <CardHeader>
            <h4 className="font-semibold">Top matches for this buyer</h4>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {card.mlsMatches.map((property, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg">
                  <p className="font-medium">{property.address || `Property ${i + 1}`}</p>
                  <p className="text-sm text-muted-foreground">
                    {property.price && `$${property.price.toLocaleString()}`}
                    {property.bedrooms && ` • ${property.bedrooms} bed`}
                    {property.bathrooms && ` • ${property.bathrooms} bath`}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Investor Alert */}
      {isInvestor && (
        <Alert>
          <AlertTitle>Detected: Investor inquiry</AlertTitle>
          <AlertDescription>
            This lead is asking about returns, not occupancy.
            You may want to respond with investment-specific info.
          </AlertDescription>
        </Alert>
      )}

      {/* Non-Buyer Alert */}
      {isNonBuyer && (
        <Alert variant="default" className="bg-slate-50">
          <AlertDescription>
            This doesn't look like a buyer inquiry.
            No buyer response was generated.
          </AlertDescription>
        </Alert>
      )}

      {/* Suggested Response (only for buyers/investors) */}
      {(isBuyerLead || isInvestor) && card.suggestedMessage && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <h4 className="font-semibold">Suggested first response</h4>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{card.suggestedMessage}</p>
            <p className="text-xs text-muted-foreground mt-2 italic">
              This message explains "why," not just availability.
            </p>
            {card.clarifyingQuestion && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <h5 className="font-medium text-blue-700 text-sm">Ask this:</h5>
                <p className="text-sm">{card.clarifyingQuestion}</p>
              </div>
            )}
            <Button className="mt-3" onClick={handleCopyMessage}>
              <Copy className="w-4 h-4 mr-2" /> Copy response
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Report Ready Section - shows when report has been generated */}
      {(isBuyerLead || isInvestor) && currentReportShareId && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="font-medium text-green-800">Report Ready</span>
              {emailSent && (
                <Badge variant="outline" className="text-green-600 border-green-300 ml-auto">
                  Email Sent
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/buyer-report/${currentReportShareId}`, "_blank")}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                View Report
              </Button>
              {leadEligibility?.extractedEmail && !emailSent && (
                <Button
                  size="sm"
                  onClick={() => setShowEmailModal(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Mail className="h-4 w-4 mr-1" />
                  Send to Lead
                </Button>
              )}
            </div>
            {!leadEligibility?.extractedEmail && (
              <p className="text-xs text-muted-foreground mt-2">
                No email on file - share the report link manually
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Chat Engagement Section - shows chatbot interaction data */}
      {(isBuyerLead || isInvestor) && currentReportShareId && chatSummary && (
        <Card className={chatSummary.hasEngaged ? "border-blue-200 bg-blue-50" : "border-slate-200"}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className={`h-5 w-5 ${chatSummary.hasEngaged ? "text-blue-600" : "text-slate-400"}`} />
              <span className={`font-medium ${chatSummary.hasEngaged ? "text-blue-800" : "text-slate-600"}`}>
                Chat Engagement
              </span>
              {chatSummary.hasEngaged && (
                <Badge variant="outline" className="text-blue-600 border-blue-300 ml-auto">
                  Active
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <span>{chatSummary.totalMessages} messages</span>
              </div>
              <div className="flex items-center gap-2">
                <MousePointerClick className={`h-4 w-4 ${chatSummary.ctaClicked ? "text-green-600" : "text-muted-foreground"}`} />
                <span className={chatSummary.ctaClicked ? "text-green-600 font-medium" : ""}>
                  {chatSummary.ctaClicked ? "CTA Clicked!" : chatSummary.ctaShown ? "CTA Shown" : "No CTA yet"}
                </span>
              </div>
            </div>
            {!chatSummary.hasEngaged && (
              <p className="text-xs text-muted-foreground mt-2">
                Lead hasn't interacted with the chatbot yet
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions: Save as Profile + Generate Report */}
      {(isBuyerLead || isInvestor) && (
        <Card>
          <CardFooter className="pt-4 flex flex-col gap-2">
            {/* Generate Report - always show, disabled if not eligible or already generated */}
            <div className="w-full">
              <Button
                onClick={handleGenerateOutreach}
                disabled={isGeneratingOutreach || !canGenerateOutreach || !!currentReportShareId}
                className={`w-full ${canGenerateOutreach && !currentReportShareId ? "bg-green-600 hover:bg-green-700" : "bg-gray-400 cursor-not-allowed"}`}
              >
                {isGeneratingOutreach ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : currentReportShareId ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Report Generated
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Generate Report
                  </>
                )}
              </Button>
              {!canGenerateOutreach && !currentReportShareId && outreachEligibility.missing.length > 0 && (
                <p className="text-xs text-amber-600 mt-1 text-center">
                  Missing: {outreachEligibility.missing.join(", ")}
                </p>
              )}
            </div>
            <Button onClick={onSaveAsProfile} variant="outline" className="w-full">
              <UserPlus className="w-4 h-4 mr-2" />
              Save as Buyer Profile
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Email Modal - same as buyer profile flow */}
      {currentReportShareId && (
        <OutreachModal
          open={showEmailModal}
          onOpenChange={(open) => {
            setShowEmailModal(open);
            // Mark as sent when modal closes (email was sent successfully)
            if (!open && showEmailModal) {
              setEmailSent(true);
            }
          }}
          shareId={currentReportShareId}
          shareUrl={`${window.location.origin}/buyer-report/${currentReportShareId}`}
          buyerEmail={leadEligibility?.extractedEmail || ""}
        />
      )}

      {/* Extraction Confidence (for debugging) */}
      <div className="text-xs text-muted-foreground text-right">
        Extraction confidence: {card.extractionConfidence}%
      </div>
    </div>
  );
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import LeadCard from "./lead-card";
import { X, ChevronDown, ChevronUp, Home, Bed, Bath, Ruler, DollarSign } from "lucide-react";

interface LeadData {
  id: number;
  status: string;
  role: string;
  roleReason: string;
  leadType: string;
  leadTypeReason: string;
  source: string;
  propertyUrl: string | null;
  propertyAddress: string | null;
  intentScore: number;
  intentReasons: string[];
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
  suggestedMessage: string | null;
  clarifyingQuestion: string | null;
  whatToClarify: string[];
  mlsSearchStatus: string | null;
  mlsMatches: any[] | null;
  extractionConfidence: number | null;
  // Property details from Repliers API
  propertyListingId: string | null;
  propertyListPrice: number | null;
  propertyBedrooms: number | null;
  propertyBathrooms: string | null;
  propertySqft: number | null;
  propertyImageUrl: string | null;
  rawInput: string;
  createdAt: string;
  reportShareId: string | null;
  reportSentAt: string | null;
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

interface LeadDisplayProps {
  lead: LeadData;
  card: LeadCardData;
  onClose?: () => void;
}

function LeadProfileField({ label, value }: { label: string; value: any }) {
  const isUnknown = value === null || value === undefined || value === "";
  return (
    <div className="flex justify-between py-1 border-b border-slate-100 last:border-0">
      <span className="text-muted-foreground text-sm">{label}:</span>
      <span className={`text-sm ${isUnknown ? "text-amber-500 italic" : ""}`}>
        {isUnknown ? "Unknown" : String(value)}
      </span>
    </div>
  );
}

export default function LeadDisplay({ lead, card, onClose }: LeadDisplayProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showRawInput, setShowRawInput] = useState(false);

  const handleSaveAsProfile = async () => {
    try {
      const response = await apiRequest("POST", `/api/leads/${lead.id}/convert`, {});
      const data = await response.json();

      toast({
        title: "Buyer profile created",
        description: "You can refine it anytime.",
      });

      // Navigate to the new profile
      if (data.profileId) {
        setLocation(`/profiles/${data.profileId}`);
      }
    } catch (error) {
      toast({
        title: "Conversion Failed",
        description: "Failed to create buyer profile. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Close */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">
            {lead.extractedName || "New Lead"}
          </h2>
          <Badge variant="outline" className="text-xs">
            {lead.source?.toUpperCase() || "UNKNOWN"}
          </Badge>
          <Badge
            variant={lead.status === "converted" ? "default" : "secondary"}
            className="text-xs"
          >
            {lead.status}
          </Badge>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Extracted Profile */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Extracted Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <LeadProfileField label="Name" value={lead.extractedName} />
              <LeadProfileField label="Email" value={lead.extractedEmail} />
              <LeadProfileField label="Phone" value={lead.extractedPhone} />
              <LeadProfileField label="Location" value={lead.extractedLocation} />
              <LeadProfileField label="Budget" value={lead.extractedBudget} />
              <LeadProfileField label="Budget Min" value={lead.extractedBudgetMin ? `$${lead.extractedBudgetMin.toLocaleString()}` : null} />
              <LeadProfileField label="Budget Max" value={lead.extractedBudgetMax ? `$${lead.extractedBudgetMax.toLocaleString()}` : null} />
              <LeadProfileField label="Bedrooms" value={lead.extractedBedrooms} />
              <LeadProfileField label="Bathrooms" value={lead.extractedBathrooms} />
              <LeadProfileField label="Home Type" value={lead.extractedHomeType} />
              <LeadProfileField label="Timeline" value={lead.extractedTimeline} />
            </CardContent>
          </Card>

          {/* Hints */}
          {lead.hints && lead.hints.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Hints (Soft Signals)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {lead.hints.map((hint, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {hint}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Property Info - Enhanced with MLS data */}
          {(lead.propertyUrl || lead.propertyAddress || lead.propertyListPrice) && (
            <Card className={lead.propertyListPrice ? "border-2 border-blue-200 bg-blue-50/30" : ""}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Home className="h-5 w-5 text-blue-600" />
                  Property Interest
                  {lead.propertyListPrice && (
                    <Badge variant="secondary" className="ml-2">MLS Data</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Property Image */}
                {lead.propertyImageUrl && (
                  <div className="relative w-full h-40 rounded-lg overflow-hidden mb-3">
                    <img
                      src={lead.propertyImageUrl}
                      alt="Property"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Address */}
                {lead.propertyAddress && (
                  <LeadProfileField label="Address" value={lead.propertyAddress} />
                )}

                {/* MLS Property Details */}
                {lead.propertyListPrice && (
                  <div className="grid grid-cols-2 gap-3 mt-3 p-3 bg-white rounded-lg">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-xs text-muted-foreground">List Price</p>
                        <p className="font-semibold">${lead.propertyListPrice.toLocaleString()}</p>
                      </div>
                    </div>
                    {lead.propertyBedrooms && (
                      <div className="flex items-center gap-2">
                        <Bed className="h-4 w-4 text-blue-600" />
                        <div>
                          <p className="text-xs text-muted-foreground">Beds</p>
                          <p className="font-semibold">{lead.propertyBedrooms}</p>
                        </div>
                      </div>
                    )}
                    {lead.propertyBathrooms && (
                      <div className="flex items-center gap-2">
                        <Bath className="h-4 w-4 text-blue-600" />
                        <div>
                          <p className="text-xs text-muted-foreground">Baths</p>
                          <p className="font-semibold">{lead.propertyBathrooms}</p>
                        </div>
                      </div>
                    )}
                    {lead.propertySqft && (
                      <div className="flex items-center gap-2">
                        <Ruler className="h-4 w-4 text-blue-600" />
                        <div>
                          <p className="text-xs text-muted-foreground">Sqft</p>
                          <p className="font-semibold">{lead.propertySqft.toLocaleString()}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* MLS ID */}
                {lead.propertyListingId && (
                  <p className="text-xs text-muted-foreground mt-2">
                    MLS# {lead.propertyListingId}
                  </p>
                )}

                {/* Property URL */}
                {lead.propertyUrl && (
                  <div className="flex justify-between py-1 border-t pt-2 mt-2">
                    <span className="text-muted-foreground text-sm">URL:</span>
                    <a
                      href={lead.propertyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline truncate max-w-[200px]"
                    >
                      {lead.propertyUrl}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Raw Input (Collapsible) */}
          <Card>
            <CardHeader
              className="cursor-pointer"
              onClick={() => setShowRawInput(!showRawInput)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Original Message</CardTitle>
                {showRawInput ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
            </CardHeader>
            {showRawInput && (
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-slate-50 p-3 rounded">
                  {lead.rawInput}
                </p>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Right: Lead Card (Agent Feedback) */}
        <div>
          <LeadCard
            leadId={lead.id}
            card={card}
            leadEligibility={{
              extractedEmail: lead.extractedEmail,
              extractedBudgetMin: lead.extractedBudgetMin,
              extractedBudgetMax: lead.extractedBudgetMax,
              propertyListPrice: lead.propertyListPrice,
              extractedLocation: lead.extractedLocation,
              propertyAddress: lead.propertyAddress,
              reportShareId: lead.reportShareId,
              reportSentAt: lead.reportSentAt,
              emailSentAt: lead.reportSentAt,
            }}
            onSaveAsProfile={handleSaveAsProfile}
          />
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import VoiceInput from "./voice-input";
import type { ExtractedProfile } from "@shared/schema";

// Lead extraction response type
interface LeadExtractionResponse {
  lead: any;
  card: {
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
  };
}

interface ProfileFormProps {
  onProfileExtracted: (profile: ExtractedProfile) => void;
  onLeadProcessed?: (response: LeadExtractionResponse) => void;
}

export default function ProfileForm({ onProfileExtracted, onLeadProcessed }: ProfileFormProps) {
  // Mode: "lead" for quick lead intake, "profile" for full profile creation
  const [mode, setMode] = useState<"lead" | "profile">(() => {
    const stored = localStorage.getItem("profileMode");
    return (stored === "lead" || stored === "profile") ? stored : "lead";
  });

  // Persist mode selection
  useEffect(() => {
    localStorage.setItem("profileMode", mode);
  }, [mode]);

  const [inputText, setInputText] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  // Lead-specific fields
  const [leadSource, setLeadSource] = useState("unknown");
  const [propertyUrlOrAddress, setPropertyUrlOrAddress] = useState("");

  const { toast } = useToast();

  // Profile extraction mutation (Full Profile mode)
  const extractMutation = useMutation({
    mutationFn: async (input: string) => {
      const response = await apiRequest("POST", "/api/extract-profile", { input });
      return response.json();
    },
    onSuccess: (data: ExtractedProfile) => {
      // Override name and email if provided in the form
      const enhancedProfile = {
        ...data,
        name: buyerName || data.name,
        email: buyerEmail || data.email
      };
      onProfileExtracted(enhancedProfile);
      toast({
        title: "Profile Extracted Successfully",
        description: "Buyer profile has been extracted from your input.",
      });
      setInputText("");
      setBuyerName("");
      setBuyerEmail("");
    },
    onError: (error) => {
      toast({
        title: "Extraction Failed",
        description: error.message || "Failed to extract buyer profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Lead processing mutation (Lead Intake mode)
  const leadMutation = useMutation({
    mutationFn: async (rawText: string) => {
      const response = await apiRequest("POST", "/api/process-lead", {
        rawText,
        source: leadSource,
        propertyUrlOrAddress: propertyUrlOrAddress || undefined,
      });
      return response.json();
    },
    onSuccess: (data: LeadExtractionResponse) => {
      if (onLeadProcessed) {
        onLeadProcessed(data);
      }
      toast({
        title: "Lead Processed",
        description: `${data.card.classification.role.replace("_", " ")} detected with ${data.card.intentScore}% intent.`,
      });
      setInputText("");
      setPropertyUrlOrAddress("");
    },
    onError: (error) => {
      toast({
        title: "Lead Processing Failed",
        description: error.message || "Failed to process lead. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleVoiceTranscription = (transcription: string) => {
    setInputText(prev => prev + " " + transcription);
  };

  const handleExtract = () => {
    if (mode === "lead") {
      // Lead mode: only requires the lead text
      if (!inputText.trim()) {
        toast({
          title: "Lead Text Required",
          description: "Please paste the lead message to process.",
          variant: "destructive",
        });
        return;
      }
      leadMutation.mutate(inputText.trim());
    } else {
      // Profile mode: requires name, email, and description
      const missing = [];
      if (!inputText.trim()) missing.push("buyer requirements description");
      if (!buyerName.trim()) missing.push("buyer name");
      if (!buyerEmail.trim()) missing.push("email address");

      if (missing.length > 0) {
        toast({
          title: "Required Fields Missing",
          description: `Please fill in: ${missing.join(", ")}`,
          variant: "destructive",
        });
        return;
      }

      extractMutation.mutate(inputText.trim());
    }
  };

  const isProcessing = extractMutation.isPending || leadMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            {mode === "lead" ? "Lead Intake" : "Full Profile Creation"}
          </CardTitle>
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === "lead" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("lead")}
            >
              <Zap className="h-4 w-4 mr-1" />
              Lead Intake
            </Button>
            <Button
              variant={mode === "profile" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("profile")}
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Full Profile
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lead-specific fields (Lead mode only) */}
        {mode === "lead" && (
          <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lead-source" className="text-sm font-medium text-slate-700 mb-2 block">
                  Lead Source (optional)
                </Label>
                <Select value={leadSource} onValueChange={setLeadSource}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="zillow">Zillow</SelectItem>
                    <SelectItem value="redfin">Redfin</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="property-url" className="text-sm font-medium text-slate-700 mb-2 block">
                  Property URL or Address (optional)
                </Label>
                <Input
                  id="property-url"
                  value={propertyUrlOrAddress}
                  onChange={(e) => setPropertyUrlOrAddress(e.target.value)}
                  placeholder="https://zillow.com/... or 123 Main St"
                />
              </div>
            </div>
          </div>
        )}

        {/* Basic Information (Profile mode only) */}
        {mode === "profile" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="buyer-name" className="text-sm font-medium text-slate-700 mb-2 block">
                  Buyer Name *
                </Label>
                <Input
                  id="buyer-name"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="John & Sarah Smith"
                />
              </div>
              <div>
                <Label htmlFor="buyer-email" className="text-sm font-medium text-slate-700 mb-2 block">
                  Email Address *
                </Label>
                <Input
                  id="buyer-email"
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="john.smith@email.com"
                />
              </div>
            </div>
          </div>
        )}

        {/* Text Input */}
        <div>
          <Label htmlFor="buyer-input" className="text-sm font-medium text-slate-700 mb-2 block">
            {mode === "lead"
              ? "Paste lead message here"
              : "Describe the buyer requirements"}
          </Label>
          <Textarea
            id="buyer-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="min-h-[128px] resize-none"
            placeholder={mode === "lead"
              ? "Hi, I saw your listing on Zillow for 123 Main St. I'm interested in scheduling a tour. We're looking for a 3-bed home around $500K..."
              : "Example: Young couple looking for a 3-bedroom house in downtown area, budget around $500K, needs garage and modern kitchen, no fixer-uppers..."
            }
          />
        </div>

        {/* Voice Input */}
        <div>
          <Label className="text-sm font-medium text-slate-700 mb-2 block">
            Voice Input
          </Label>
          <VoiceInput
            onTranscription={handleVoiceTranscription}
            isRecording={isRecording}
            setIsRecording={setIsRecording}
          />
        </div>

        {/* Action Button */}
        <div className="pt-4">
          <Button
            onClick={handleExtract}
            disabled={isProcessing || isRecording}
            className="bg-primary hover:bg-primary/90 w-full"
          >
            {mode === "lead" ? (
              <>
                <Zap className="h-4 w-4 mr-2" />
                {isProcessing ? "Processing Lead..." : "Process Lead"}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {isProcessing ? "Extracting..." : "Extract Buyer Profile"}
              </>
            )}
          </Button>

          {/* Validation hints (Profile mode only) */}
          {mode === "profile" && (!inputText.trim() || !buyerName.trim() || !buyerEmail.trim()) && (
            <div className="mt-2 text-sm text-slate-500">
              <p className="mb-1">Required fields:</p>
              <ul className="list-disc list-inside space-y-1">
                {!buyerName.trim() && <li>Buyer Name</li>}
                {!buyerEmail.trim() && <li>Email Address</li>}
                {!inputText.trim() && <li>Buyer requirements description</li>}
              </ul>
            </div>
          )}

          {/* Lead mode hint */}
          {mode === "lead" && !inputText.trim() && (
            <div className="mt-2 text-sm text-slate-500">
              Paste an inbound lead message from Zillow, Redfin, Google, or a referral.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
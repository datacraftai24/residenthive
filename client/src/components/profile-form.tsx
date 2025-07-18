import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import VoiceInput from "./voice-input";
import type { ExtractedProfile } from "@shared/schema";

interface ProfileFormProps {
  onProfileExtracted: (profile: ExtractedProfile) => void;
}

export default function ProfileForm({ onProfileExtracted }: ProfileFormProps) {
  const [inputText, setInputText] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const { toast } = useToast();

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

  const handleVoiceTranscription = (transcription: string) => {
    setInputText(prev => prev + " " + transcription);
  };

  const handleExtract = () => {
    if (!inputText.trim()) {
      toast({
        title: "Input Required",
        description: "Please provide buyer information via text or voice input.",
        variant: "destructive",
      });
      return;
    }

    if (!buyerName.trim()) {
      toast({
        title: "Name Required",
        description: "Please provide the buyer name for unique identification.",
        variant: "destructive",
      });
      return;
    }

    if (!buyerEmail.trim()) {
      toast({
        title: "Email Required",
        description: "Please provide the buyer email address for unique identification.",
        variant: "destructive",
      });
      return;
    }

    extractMutation.mutate(inputText.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Profile Creation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Basic Information */}
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

        {/* Text Input */}
        <div>
          <Label htmlFor="buyer-input" className="text-sm font-medium text-slate-700 mb-2 block">
            Describe the buyer requirements
          </Label>
          <Textarea
            id="buyer-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="min-h-[128px] resize-none"
            placeholder="Example: Young couple looking for a 3-bedroom house in downtown area, budget around $500K, needs garage and modern kitchen, no fixer-uppers..."
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
            disabled={extractMutation.isPending || isRecording || !inputText.trim() || !buyerName.trim() || !buyerEmail.trim()}
            className="bg-primary hover:bg-primary/90"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {extractMutation.isPending ? "Extracting..." : "Extract Buyer Profile"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
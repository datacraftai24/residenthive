import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Edit, Copy, Search, Clock, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ExtractedProfile, InsertBuyerProfile } from "@shared/schema";
import ProfileDetailsCard from "./ProfileDetailsCard";
import RequirementsPopup from "./requirements-popup";
import { useState, useEffect } from "react";

type MissingField = "location" | "budget" | "homeType" | "bedrooms" | "bathrooms";

function checkMissingRequirements(profile: ExtractedProfile): MissingField[] {
  const missing: MissingField[] = [];
  if (!profile.location && !profile.preferredAreas?.[0]) missing.push("location");
  if (!profile.budget && !profile.budgetMin && !profile.budgetMax) missing.push("budget");
  if (!profile.homeType) missing.push("homeType");
  if (profile.bedrooms === null || profile.bedrooms === undefined) missing.push("bedrooms");
  if (!profile.bathrooms) missing.push("bathrooms");
  return missing;
}

interface Agent {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  brokerageName: string;
}

interface ProfileDisplayProps {
  extractedProfile: ExtractedProfile;
  agent: Agent | null;
  onProfileSaved: () => void;
}

export default function ProfileDisplay({ extractedProfile, agent, onProfileSaved }: ProfileDisplayProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditingBasics, setIsEditingBasics] = useState(false);
  const [editedProfile, setEditedProfile] = useState(extractedProfile);
  const [showRequirementsPopup, setShowRequirementsPopup] = useState(false);
  const [missingFields, setMissingFields] = useState<MissingField[]>([]);

  // Auto-check for missing requirements when profile is loaded
  useEffect(() => {
    const missing = checkMissingRequirements(extractedProfile);
    if (missing.length > 0) {
      setMissingFields(missing);
      setShowRequirementsPopup(true);
    }
  }, [extractedProfile]);

  const saveMutation = useMutation({
    mutationFn: async (profile: InsertBuyerProfile) => {
      const response = await apiRequest("POST", "/api/buyer-profiles", profile);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buyer-profiles"] });
      toast({
        title: "Profile Saved",
        description: "Buyer profile has been saved successfully.",
      });
      onProfileSaved();
    },
    onError: (error) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save buyer profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    // Validate required fields
    const missingFields: string[] = [];

    if (!editedProfile.name) missingFields.push("Name");
    if (!editedProfile.email) missingFields.push("Email");

    // Validate email format
    if (editedProfile.email && !editedProfile.email.includes("@")) {
      toast({
        title: "Invalid Email",
        description: "Please provide a valid email address with @ symbol",
        variant: "destructive",
      });
      setIsEditingBasics(true); // Open edit mode to fix email
      return;
    }

    if (!editedProfile.location && !editedProfile.preferredAreas?.[0]) missingFields.push("Location");
    if (!editedProfile.budget) {
      missingFields.push("Budget");
    }
    if (!editedProfile.homeType) missingFields.push("Home Type");
    if (editedProfile.bedrooms === null || editedProfile.bedrooms === undefined) missingFields.push("Bedrooms");
    if (!editedProfile.bathrooms) missingFields.push("Bathrooms");

    if (missingFields.length > 0) {
      toast({
        title: "Missing Required Fields",
        description: `Please provide the following required fields: ${missingFields.join(", ")}. Click Edit to fill them in.`,
        variant: "destructive",
      });
      setIsEditingBasics(true); // Open edit mode
      return;
    }

    const profileToSave: InsertBuyerProfile = {
      name: editedProfile.name,
      email: editedProfile.email,
      agentId: agent?.id,
      location: editedProfile.location || editedProfile.preferredAreas[0],
      budget: editedProfile.budget,
      budgetMin: editedProfile.budgetMin || null,
      budgetMax: editedProfile.budgetMax || null,
      homeType: editedProfile.homeType,
      bedrooms: editedProfile.bedrooms,
      maxBedrooms: editedProfile.maxBedrooms || null,
      bathrooms: editedProfile.bathrooms,
      mustHaveFeatures: editedProfile.mustHaveFeatures,
      niceToHaves: editedProfile.niceToHaves || [],
      dealbreakers: editedProfile.dealbreakers,
      preferredAreas: editedProfile.preferredAreas || [],
      lifestyleDrivers: editedProfile.lifestyleDrivers || [],
      specialNeeds: editedProfile.specialNeeds || [],
      budgetFlexibility: editedProfile.budgetFlexibility || 50,
      locationFlexibility: editedProfile.locationFlexibility || 50,
      timingFlexibility: editedProfile.timingFlexibility || 50,
      emotionalContext: editedProfile.emotionalContext,
      voiceTranscript: undefined,
      inferredTags: editedProfile.inferredTags || [],
      emotionalTone: editedProfile.emotionalTone,
      priorityScore: editedProfile.priorityScore || 50,
      aiSummary: editedProfile.aiSummary,
      decisionDrivers: editedProfile.decisionDrivers || [],
      constraints: editedProfile.constraints || [],
      flexibilityExplanations: editedProfile.flexibilityExplanations || {
        budget: "",
        location: "",
        timing: ""
      },
      visionChecklist: editedProfile.visionChecklist || {
        structural: [],
        lifestyle: [],
        dealbreakers: [],
        optional: []
      },
      rawInput: `Budget: ${editedProfile.budget}, Home Type: ${editedProfile.homeType}, ${editedProfile.bedrooms} bedrooms, ${editedProfile.bathrooms} bathrooms`
    };

    saveMutation.mutate(profileToSave);
  };

  const handleRequirementsUpdate = (updated: ExtractedProfile) => {
    setEditedProfile(updated);
    setShowRequirementsPopup(false);
    setMissingFields([]);
    toast({
      title: "Profile Updated",
      description: "Required fields have been filled in.",
    });
  };

  return (
    <>
      {/* Requirements Popup - auto-shows if fields are missing */}
      {showRequirementsPopup && missingFields.length > 0 && (
        <RequirementsPopup
          profile={editedProfile}
          missingFields={missingFields}
          onUpdate={handleRequirementsUpdate}
          onClose={() => setShowRequirementsPopup(false)}
        />
      )}

      <Card>
        <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Extracted Profile</CardTitle>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Basic Fields Edit Mode */}
        {isEditingBasics && (
          <div className="mb-6 p-4 border-2 border-blue-500 rounded-lg bg-blue-50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-blue-900">Edit Basic Information</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingBasics(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-name" className="text-sm font-medium mb-2 block">
                  Buyer Name *
                </Label>
                <Input
                  id="edit-name"
                  value={editedProfile.name || ""}
                  onChange={(e) => setEditedProfile({ ...editedProfile, name: e.target.value })}
                  placeholder="John & Sarah Smith"
                  className="bg-white"
                />
              </div>
              <div>
                <Label htmlFor="edit-email" className="text-sm font-medium mb-2 block">
                  Email Address *
                </Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editedProfile.email || ""}
                  onChange={(e) => setEditedProfile({ ...editedProfile, email: e.target.value })}
                  placeholder="john.smith@email.com"
                  className={`bg-white ${editedProfile.email && !editedProfile.email.includes("@") ? "border-red-500" : ""}`}
                />
                {editedProfile.email && !editedProfile.email.includes("@") && (
                  <p className="text-xs text-red-600 mt-1">Email must contain @ symbol</p>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => setIsEditingBasics(false)}
                size="sm"
                disabled={!editedProfile.name || !editedProfile.email || !editedProfile.email.includes("@")}
              >
                Done Editing
              </Button>
            </div>
          </div>
        )}

        {/* Use shared ProfileDetailsCard component */}
        <ProfileDetailsCard profile={editedProfile as any} />

        {/* Profile Actions */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-200 mt-6">
          <div className="flex items-center space-x-2 text-sm text-slate-500">
            <Clock className="h-4 w-4" />
            <span>Just extracted</span>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingBasics(true)}
            >
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" size="sm">
              <Copy className="h-4 w-4 mr-1" />
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-primary hover:text-primary"
              title="Scan the MLS for this buyer using their profile and generate AI recommendations"
            >
              <Search className="h-4 w-4 mr-1" />
              Run AI Search
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    </>
  );
}

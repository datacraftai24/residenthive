import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  MapPin, 
  Bed, 
  Bath, 
  Star, 
  XCircle, 
  Save,
  Edit,
  Copy,
  Search,
  Clock,
  Settings
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ExtractedProfile, InsertBuyerProfile } from "@shared/schema";

interface ProfileDisplayProps {
  extractedProfile: ExtractedProfile;
  onProfileSaved: () => void;
}

export default function ProfileDisplay({ extractedProfile, onProfileSaved }: ProfileDisplayProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
    const profileToSave: InsertBuyerProfile = {
      name: extractedProfile.name,
      email: extractedProfile.email || "noemail@provided.com",
      budget: extractedProfile.budget,
      budgetMin: extractedProfile.budgetMin,
      budgetMax: extractedProfile.budgetMax,
      homeType: extractedProfile.homeType,
      bedrooms: extractedProfile.bedrooms,
      bathrooms: extractedProfile.bathrooms,
      mustHaveFeatures: extractedProfile.mustHaveFeatures,
      dealbreakers: extractedProfile.dealbreakers,
      preferredAreas: extractedProfile.preferredAreas || [],
      lifestyleDrivers: extractedProfile.lifestyleDrivers || [],
      specialNeeds: extractedProfile.specialNeeds || [],
      budgetFlexibility: extractedProfile.budgetFlexibility || 50,
      locationFlexibility: extractedProfile.locationFlexibility || 50,
      timingFlexibility: extractedProfile.timingFlexibility || 50,
      emotionalContext: extractedProfile.emotionalContext,
      voiceTranscript: undefined,
      inferredTags: extractedProfile.inferredTags || [],
      emotionalTone: extractedProfile.emotionalTone,
      priorityScore: extractedProfile.priorityScore || 50,
      rawInput: `Budget: ${extractedProfile.budget}, Home Type: ${extractedProfile.homeType}, ${extractedProfile.bedrooms} bedrooms, ${extractedProfile.bathrooms} bathrooms`
    };

    saveMutation.mutate(profileToSave);
  };

  return (
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
        {/* Profile Overview */}
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">{extractedProfile.name}</h2>
              {extractedProfile.email && (
                <p className="text-slate-600 mb-2">{extractedProfile.email}</p>
              )}
              <p className="text-3xl font-bold text-primary">{extractedProfile.budget}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600 mb-1">Priority Score</p>
              <div className="flex items-center space-x-2">
                <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">{extractedProfile.priorityScore || 50}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">

          {/* Preferred Areas */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              <h3 className="font-medium text-slate-900">Areas</h3>
            </div>
            <p className="text-lg font-semibold text-slate-900">
              {extractedProfile.preferredAreas && extractedProfile.preferredAreas.length > 0 
                ? extractedProfile.preferredAreas.join(", ") 
                : "Flexible"}
            </p>
          </div>

          {/* Bedrooms */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Bed className="h-4 w-4 text-purple-600" />
              <h3 className="font-medium text-slate-900">Bedrooms</h3>
            </div>
            <p className="text-lg font-semibold text-slate-900">{extractedProfile.bedrooms}</p>
          </div>

          {/* Bathrooms */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Bath className="h-4 w-4 text-teal-600" />
              <h3 className="font-medium text-slate-900">Bathrooms</h3>
            </div>
            <p className="text-lg font-semibold text-slate-900">{extractedProfile.bathrooms}</p>
          </div>

          {/* Home Type */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign className="h-4 w-4 text-orange-600" />
              <h3 className="font-medium text-slate-900">Home Type</h3>
            </div>
            <p className="text-lg font-semibold text-slate-900 capitalize">
              {extractedProfile.homeType.replace('-', ' ')}
            </p>
          </div>

          {/* Must-Have Features */}
          <div className="bg-slate-50 rounded-lg p-4 md:col-span-2">
            <div className="flex items-center space-x-2 mb-3">
              <Star className="h-4 w-4 text-yellow-600" />
              <h3 className="font-medium text-slate-900">Must-Have Features</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {extractedProfile.mustHaveFeatures.length > 0 ? (
                extractedProfile.mustHaveFeatures.map((feature, index) => (
                  <Badge key={index} className="bg-green-100 text-green-800 hover:bg-green-100">
                    {feature}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-slate-500">No specific requirements</span>
              )}
            </div>
          </div>

          {/* Preferred Areas */}
          <div className="bg-slate-50 rounded-lg p-4 md:col-span-2">
            <div className="flex items-center space-x-2 mb-3">
              <MapPin className="h-4 w-4 text-indigo-600" />
              <h3 className="font-medium text-slate-900">Preferred Areas</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {extractedProfile.preferredAreas?.length > 0 ? (
                extractedProfile.preferredAreas.map((area, index) => (
                  <Badge key={index} className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                    {area}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-slate-500">No specific areas</span>
              )}
            </div>
          </div>

          {/* Lifestyle Drivers */}
          <div className="bg-slate-50 rounded-lg p-4 md:col-span-2">
            <div className="flex items-center space-x-2 mb-3">
              <Star className="h-4 w-4 text-purple-600" />
              <h3 className="font-medium text-slate-900">Lifestyle Priorities</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {extractedProfile.lifestyleDrivers?.length > 0 ? (
                extractedProfile.lifestyleDrivers.map((driver, index) => (
                  <Badge key={index} className="bg-purple-100 text-purple-800 hover:bg-purple-100">
                    {driver}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-slate-500">No specific priorities</span>
              )}
            </div>
          </div>

          {/* Special Needs */}
          <div className="bg-slate-50 rounded-lg p-4 md:col-span-2">
            <div className="flex items-center space-x-2 mb-3">
              <Star className="h-4 w-4 text-cyan-600" />
              <h3 className="font-medium text-slate-900">Special Requirements</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {extractedProfile.specialNeeds?.length > 0 ? (
                extractedProfile.specialNeeds.map((need, index) => (
                  <Badge key={index} className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">
                    {need}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-slate-500">No special requirements</span>
              )}
            </div>
          </div>

          {/* Dealbreakers */}
          <div className="bg-slate-50 rounded-lg p-4 md:col-span-3">
            <div className="flex items-center space-x-2 mb-3">
              <XCircle className="h-4 w-4 text-red-600" />
              <h3 className="font-medium text-slate-900">Dealbreakers</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {extractedProfile.dealbreakers.length > 0 ? (
                extractedProfile.dealbreakers.map((dealbreaker, index) => (
                  <Badge key={index} className="bg-red-100 text-red-800 hover:bg-red-100">
                    {dealbreaker}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-slate-500">No specific dealbreakers</span>
              )}
            </div>
          </div>

          {/* Flexibility Scores */}
          {(extractedProfile.budgetFlexibility !== undefined || 
            extractedProfile.locationFlexibility !== undefined || 
            extractedProfile.timingFlexibility !== undefined) && (
            <div className="bg-slate-50 rounded-lg p-4 md:col-span-3">
              <div className="flex items-center space-x-2 mb-3">
                <Settings className="h-4 w-4 text-slate-600" />
                <h3 className="font-medium text-slate-900">Flexibility Scores</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {extractedProfile.budgetFlexibility !== undefined && (
                  <div className="text-center">
                    <p className="text-sm text-slate-600">Budget</p>
                    <p className="text-lg font-semibold text-slate-900">{extractedProfile.budgetFlexibility}%</p>
                  </div>
                )}
                {extractedProfile.locationFlexibility !== undefined && (
                  <div className="text-center">
                    <p className="text-sm text-slate-600">Location</p>
                    <p className="text-lg font-semibold text-slate-900">{extractedProfile.locationFlexibility}%</p>
                  </div>
                )}
                {extractedProfile.timingFlexibility !== undefined && (
                  <div className="text-center">
                    <p className="text-sm text-slate-600">Timing</p>
                    <p className="text-lg font-semibold text-slate-900">{extractedProfile.timingFlexibility}%</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Insights */}
          {(extractedProfile.inferredTags?.length > 0 || extractedProfile.emotionalTone || extractedProfile.priorityScore !== undefined) && (
            <div className="bg-slate-50 rounded-lg p-4 md:col-span-3">
              <div className="flex items-center space-x-2 mb-3">
                <Star className="h-4 w-4 text-amber-600" />
                <h3 className="font-medium text-slate-900">AI Insights</h3>
              </div>
              <div className="space-y-3">
                {extractedProfile.inferredTags?.length > 0 && (
                  <div>
                    <p className="text-sm text-slate-600 mb-2">Profile Tags:</p>
                    <div className="flex flex-wrap gap-2">
                      {extractedProfile.inferredTags.map((tag, index) => (
                        <Badge key={index} className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {extractedProfile.emotionalTone && (
                  <div>
                    <p className="text-sm text-slate-600">Emotional Tone: <span className="font-medium text-slate-900">{extractedProfile.emotionalTone}</span></p>
                  </div>
                )}
                {extractedProfile.priorityScore !== undefined && (
                  <div>
                    <p className="text-sm text-slate-600">Priority Score: <span className="font-medium text-slate-900">{extractedProfile.priorityScore}/100</span></p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Actions */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-200">
          <div className="flex items-center space-x-2 text-sm text-slate-500">
            <Clock className="h-4 w-4" />
            <span>Just extracted</span>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline" size="sm">
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" size="sm">
              <Copy className="h-4 w-4 mr-1" />
              Duplicate
            </Button>
            <Button variant="outline" size="sm" className="text-primary hover:text-primary">
              <Search className="h-4 w-4 mr-1" />
              Find Listings
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

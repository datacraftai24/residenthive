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
  Clock
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
      budget: extractedProfile.budget,
      location: extractedProfile.location,
      bedrooms: extractedProfile.bedrooms,
      bathrooms: extractedProfile.bathrooms,
      mustHaveFeatures: extractedProfile.mustHaveFeatures,
      dealbreakers: extractedProfile.dealbreakers,
      rawInput: `Budget: ${extractedProfile.budget}, Location: ${extractedProfile.location}, ${extractedProfile.bedrooms} bedrooms, ${extractedProfile.bathrooms} bathrooms`
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
        {/* Profile Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {/* Budget */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <h3 className="font-medium text-slate-900">Budget</h3>
            </div>
            <p className="text-lg font-semibold text-slate-900">{extractedProfile.budget}</p>
          </div>

          {/* Location */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              <h3 className="font-medium text-slate-900">Location</h3>
            </div>
            <p className="text-lg font-semibold text-slate-900">{extractedProfile.location}</p>
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

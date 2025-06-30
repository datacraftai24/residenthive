import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Edit, 
  ArrowLeft, 
  Mail, 
  DollarSign, 
  Home, 
  Bed, 
  Bath,
  Calendar,
  Target,
  Brain,
  BarChart3,
  Clock
} from "lucide-react";
import { type BuyerProfile } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";
import ProfileEdit from "./profile-edit";
import TagPersonaDisplay from "./tag-persona-display";
import ConfidenceDisplay from "./confidence-display";

interface ProfileViewerProps {
  profileId: number;
  onBack: () => void;
}

export default function ProfileViewer({ profileId, onBack }: ProfileViewerProps) {
  const [isEditing, setIsEditing] = useState(false);

  // Fetch basic profile
  const { data: profile, isLoading: profileLoading } = useQuery<BuyerProfile>({
    queryKey: [`/api/buyer-profiles/${profileId}`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!profileId
  });

  // Fetch enhanced profile with tags and persona
  const { data: enhancedProfile, isLoading: enhancedLoading } = useQuery({
    queryKey: ['/api/buyer-profiles', profileId, 'enhanced'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!profileId
  });

  const isLoading = profileLoading || enhancedLoading;

  const handleProfileUpdated = (updatedProfile: BuyerProfile) => {
    setIsEditing(false);
    // The query will automatically refetch due to cache invalidation
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Profile not found</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Profiles
        </Button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <ProfileEdit
        profile={profile}
        onClose={() => setIsEditing(false)}
        onProfileUpdated={handleProfileUpdated}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{profile.name}</h2>
            <p className="text-sm text-gray-600">Buyer Profile Details</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(profile.createdAt).toLocaleDateString()}
          </Badge>
          <Badge variant={profile.inputMethod === 'form' ? 'default' : 'secondary'}>
            {profile.inputMethod}
          </Badge>
          <ConfidenceDisplay 
            confidence={profile.nlpConfidence || 0} 
            inputMethod={profile.inputMethod as 'voice' | 'text' | 'form'}
            className="ml-2"
          />
          <Button onClick={() => setIsEditing(true)} size="sm">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-medium">{profile.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <DollarSign className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600">Budget</p>
                <p className="font-medium">{profile.budget}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Home className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600">Home Type</p>
                <p className="font-medium capitalize">{profile.homeType?.replace('-', ' ') || 'Not specified'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Bed className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600">Bedrooms</p>
                <p className="font-medium">{profile.bedrooms}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Bath className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600">Bathrooms</p>
                <p className="font-medium">{profile.bathrooms}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600">Priority Score</p>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{profile.priorityScore}/100</p>
                  <div className="w-12 h-2 bg-gray-200 rounded-full">
                    <div 
                      className="h-2 bg-blue-500 rounded-full" 
                      style={{ width: `${Math.min(100, profile.priorityScore)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Features and Preferences */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Must-Have Features</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.mustHaveFeatures.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.mustHaveFeatures.map((feature) => (
                  <Badge key={feature} variant="outline">
                    {feature.replace('-', ' ')}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No specific features required</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dealbreakers</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.dealbreakers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.dealbreakers.map((dealbreaker) => (
                  <Badge key={dealbreaker} variant="destructive">
                    {dealbreaker.replace('-', ' ')}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No specific dealbreakers</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Flexibility Scores */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Flexibility Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">Budget Flexibility</span>
                <span className="text-sm text-gray-600">{profile.budgetFlexibility}%</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full">
                <div 
                  className="h-2 bg-green-500 rounded-full" 
                  style={{ width: `${profile.budgetFlexibility}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">Location Flexibility</span>
                <span className="text-sm text-gray-600">{profile.locationFlexibility}%</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full">
                <div 
                  className="h-2 bg-blue-500 rounded-full" 
                  style={{ width: `${profile.locationFlexibility}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">Timing Flexibility</span>
                <span className="text-sm text-gray-600">{profile.timingFlexibility}%</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full">
                <div 
                  className="h-2 bg-orange-500 rounded-full" 
                  style={{ width: `${profile.timingFlexibility}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Analysis */}
      {enhancedProfile && (enhancedProfile.tags?.length > 0 || enhancedProfile.persona) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Behavioral Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TagPersonaDisplay 
              tags={enhancedProfile.tags || []} 
              persona={enhancedProfile.persona || {
                urgencyLevel: 50,
                personalityTraits: [],
                confidenceScore: 0
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Raw Input (if available) */}
      {profile.rawInput && (
        <Card>
          <CardHeader>
            <CardTitle>Original Input</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{profile.rawInput}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
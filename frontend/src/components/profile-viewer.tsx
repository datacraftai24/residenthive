import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Clock,
  Search,
  User
} from "lucide-react";
import { type BuyerProfile } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";
import ConversationalEdit from "./conversational-edit";
import TagPersonaDisplay from "./tag-persona-display";
import ConfidenceDisplay from "./confidence-display";
import AgentActions from "./agent-actions";
import AgentFeedback from "./agent-feedback";
import { NLPListingSearch } from "./nlp-listing-search";
import { AgentDualViewSearch } from "./agent-dual-view-search";
import ProfileShareButton from "./profile-share-button";
import InvestmentStrategy from "./investment-strategy";

interface ProfileViewerProps {
  profileId: number;
  onBack: () => void;
}

export default function ProfileViewer({ profileId, onBack }: ProfileViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  // Remove old search method state - using NLP search now

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

  // Allow external trigger to open edit mode from sidebar menu
  // Listen for a CustomEvent('open-profile-edit', { detail: profileId })
  useEffect(() => {
    const handler = (e: any) => {
      try {
        if (e && e.detail === profileId) setIsEditing(true);
      } catch {}
    };
    window.addEventListener('open-profile-edit', handler as EventListener);
    return () => window.removeEventListener('open-profile-edit', handler as EventListener);
  }, [profileId]);

  const handleProfileUpdated = (updatedProfile: BuyerProfile) => {
    setIsEditing(false);
    // The query will automatically refetch due to cache invalidation
  };



  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-32 sm:w-48" />
            <Skeleton className="h-4 w-48 sm:w-64" />
          </div>
        </div>
        <Skeleton className="h-48 sm:h-64 w-full" />
        <Skeleton className="h-32 sm:h-48 w-full" />
        <div className="text-center py-8">
          <p className="text-blue-600 font-medium">Loading profile data...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12 p-4 sm:p-6">
        <p className="text-gray-500 mb-4">Profile not found</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Profiles
        </Button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <ConversationalEdit
        profile={profile}
        onClose={() => setIsEditing(false)}
        onProfileUpdated={handleProfileUpdated}
      />
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 w-8 p-0 flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900">{profile.name}</h2>
            <p className="text-sm text-gray-600">Buyer Profile Details</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs">
            <Calendar className="h-3 w-3" />
            {new Date(profile.createdAt).toLocaleDateString()}
          </Badge>
          <Badge variant={profile.inputMethod === 'form' ? 'default' : 'secondary'} className="text-xs">
            {profile.inputMethod}
          </Badge>
          <div className="hidden sm:block">
            <ConfidenceDisplay 
              confidence={profile.nlpConfidence || 0} 
              inputMethod={profile.inputMethod as 'voice' | 'text' | 'form'}
              className="ml-2"
            />
          </div>
          <ProfileShareButton 
            profileId={profile.id} 
            profileName={profile.name} 
          />
          <Button onClick={() => setIsEditing(true)} size="sm" className="text-xs">
            <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            Edit
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-auto">
          <TabsTrigger value="profile" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
            <User className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Profile Details</span>
            <span className="sm:hidden">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="agent-search" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Agent Search</span>
            <span className="sm:hidden">Agent</span>
          </TabsTrigger>
          <TabsTrigger value="investment" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
            <DollarSign className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Investment Strategy</span>
            <span className="sm:hidden">Invest</span>
          </TabsTrigger>
          <TabsTrigger value="listings" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
            <Search className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Smart Search</span>
            <span className="sm:hidden">Search</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6 mt-6">
          {/* Basic Information */}
          <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="flex items-center gap-3 p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg sm:rounded-none">
              <Mail className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-gray-600">Email</p>
                <p className="font-medium text-sm sm:text-base truncate">{profile.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg sm:rounded-none">
              <DollarSign className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-gray-600">Budget</p>
                <p className="font-medium text-sm sm:text-base">{profile.budget}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg sm:rounded-none">
              <Home className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-gray-600">Home Type</p>
                <p className="font-medium text-sm sm:text-base capitalize">{profile.homeType?.replace('-', ' ') || 'Not specified'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg sm:rounded-none">
              <Bed className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-gray-600">Bedrooms</p>
                <p className="font-medium text-sm sm:text-base">{profile.bedrooms}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg sm:rounded-none">
              <Bath className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-gray-600">Bathrooms</p>
                <p className="font-medium text-sm sm:text-base">{profile.bathrooms}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg sm:rounded-none">
              <Clock className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-gray-600">Priority Score</p>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm sm:text-base">{profile.priorityScore}/100</p>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base sm:text-lg">Must-Have Features</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.mustHaveFeatures.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.mustHaveFeatures.map((feature, index) => (
                  <Badge key={`${feature}-${index}`} variant="outline" className="text-xs">
                    {feature.replace('-', ' ')}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-xs sm:text-sm">No specific features required</p>
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
                {profile.dealbreakers.map((dealbreaker, index) => (
                  <Badge key={`${dealbreaker}-${index}`} variant="destructive">
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

      {/* Agent Actions */}
      <AgentActions 
        profile={profile}
        persona={enhancedProfile?.persona}
      />

      {/* Agent Feedback */}
      {enhancedProfile && (
        <AgentFeedback 
          profile={profile}
          tags={enhancedProfile.tags || []}
          persona={enhancedProfile.persona}
        />
      )}

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
        </TabsContent>

        <TabsContent value="agent-search" className="space-y-6 mt-6">
          <AgentDualViewSearch profile={profile} />
        </TabsContent>

        <TabsContent value="investment" className="mt-6">
          <InvestmentStrategy profile={profile} />
        </TabsContent>

        <TabsContent value="listings" className="mt-6">
          {/* New NLP-Powered Search */}
          {profile && <NLPListingSearch profile={profile} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

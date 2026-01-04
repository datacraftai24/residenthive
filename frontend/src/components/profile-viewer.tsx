import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Edit,
  ArrowLeft,
  Home,
  Calendar,
  Brain,
  BarChart3,
  User,
  Lightbulb,
  FileText,
  Inbox,
  MessageSquare,
  ClipboardEdit,
  ChevronDown
} from "lucide-react";
import { type BuyerProfile } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";
import ConversationalEdit from "./conversational-edit";
import BuyerForm from "./buyer-form";
import TagPersonaDisplay from "./tag-persona-display";
import AgentActions from "./agent-actions";
import AgentFeedback from "./agent-feedback";
import { AgentDualViewSearch } from "./agent-dual-view-search";
import ReportGeneratorModal from "./report-generator-modal";
import { SavedPropertiesList } from "./saved-properties-list";
import ProfileDetailsCard from "./ProfileDetailsCard";
import BuyerInsights from "./buyer-insights";
import { LeadOriginBadge } from "./lead-origin-badge";
import { LeadPropertyCard } from "./lead-property-card";
import LeadIntelTab from "./lead-intel-tab";

type EnhancedProfileResponse = {
  profileId: number;
  tags?: Array<{
    tag: string;
    category: string;
    confidence: number;
    source: string;
  }>;
  persona?: {
    emotionalTone?: string;
    communicationStyle?: string;
    decisionMakingStyle?: string;
    urgencyLevel: number;
    priceOrientation?: string;
    personalityTraits: string[];
    confidenceScore: number;
  };
};

type ProfileLeadResponse = {
  hasLead: boolean;
  createdByMethod: string;
  lead?: {
    id: number;
    source: string;
    leadType: string;
    propertyAddress: string | null;
    propertyListPrice: number | null;
    propertyBedrooms: number | null;
    propertyBathrooms: string | null;
    propertySqft: number | null;
    propertyImageUrl: string | null;
    propertyListingId: string | null;
    extractedEmail: string | null;
    extractedPhone: string | null;
    createdAt: string;
    reportSentAt: string | null;
    reportShareId: string | null;
  };
};

interface ProfileViewerProps {
  profileId: number;
  onBack: () => void;
}

export default function ProfileViewer({ profileId, onBack }: ProfileViewerProps) {
  const [editMode, setEditMode] = useState<'conversation' | 'form' | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Fetch basic profile
  const { data: profile, isLoading: profileLoading } = useQuery<BuyerProfile>({
    queryKey: [`/api/buyer-profiles/${profileId}`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!profileId
  });

  // Fetch enhanced profile with tags and persona
  const { data: enhancedProfile, isLoading: enhancedLoading } = useQuery<EnhancedProfileResponse>({
    queryKey: ['/api/buyer-profiles', profileId, 'enhanced'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!profileId
  });

  // Fetch lead data if profile was created from a lead
  const { data: leadData } = useQuery<ProfileLeadResponse>({
    queryKey: [`/api/buyer-profiles/${profileId}/lead`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const isLoading = profileLoading || enhancedLoading;
  const enhancedTags = enhancedProfile?.tags ?? [];
  const enhancedPersona = enhancedProfile?.persona;

  // Allow external trigger to open edit mode from sidebar menu
  // Listen for a CustomEvent('open-profile-edit', { detail: profileId })
  useEffect(() => {
    const handler = (e: any) => {
      try {
        if (e && e.detail === profileId) setEditMode('conversation');
      } catch {}
    };
    window.addEventListener('open-profile-edit', handler as EventListener);
    return () => window.removeEventListener('open-profile-edit', handler as EventListener);
  }, [profileId]);

  const handleProfileUpdated = (updatedProfile: BuyerProfile) => {
    setEditMode(null);
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

  // Render edit mode components
  if (editMode === 'conversation') {
    return (
      <ConversationalEdit
        profile={profile}
        onClose={() => setEditMode(null)}
        onProfileUpdated={handleProfileUpdated}
      />
    );
  }

  if (editMode === 'form') {
    return (
      <div className="p-4 sm:p-6">
        <BuyerForm
          mode="edit"
          profile={profile}
          onProfileUpdated={handleProfileUpdated}
          onClose={() => setEditMode(null)}
        />
      </div>
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
          {leadData?.hasLead && leadData.lead && (
            <LeadOriginBadge source={leadData.lead.source} />
          )}
          <Badge variant="outline" className="gap-1 text-xs">
            <Calendar className="h-3 w-3" />
            {new Date(profile.createdAt).toLocaleDateString()}
          </Badge>
          <Button
            onClick={() => setShowReportModal(true)}
            size="sm"
            className="text-xs bg-blue-600 hover:bg-blue-700"
          >
            <FileText className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            Generate Buyer Report
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="text-xs">
                <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                Edit
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditMode('conversation')}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Quick Edit
                <span className="ml-2 text-xs text-muted-foreground">Voice/Text</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditMode('form')}>
                <ClipboardEdit className="h-4 w-4 mr-2" />
                Full Edit
                <span className="ml-2 text-xs text-muted-foreground">Form</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto">
          <TabsTrigger value="profile" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
            <User className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Profile Details</span>
            <span className="sm:hidden">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
            <Lightbulb className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Buyer Insights</span>
            <span className="sm:hidden">Insights</span>
          </TabsTrigger>
          <TabsTrigger value="agent-search" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Agent Search</span>
            <span className="sm:hidden">Agent</span>
          </TabsTrigger>
          <TabsTrigger value="saved" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
            <Home className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Saved Properties</span>
            <span className="sm:hidden">Saved</span>
          </TabsTrigger>
          <TabsTrigger value="lead" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
            <Inbox className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Lead Intel</span>
            <span className="sm:hidden">Lead</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6 mt-6">
          {/* Lead Property Card - show original property interest */}
          {leadData?.hasLead && leadData.lead?.leadType === "property_specific" && leadData.lead.propertyAddress && (
            <LeadPropertyCard
              address={leadData.lead.propertyAddress}
              listPrice={leadData.lead.propertyListPrice}
              bedrooms={leadData.lead.propertyBedrooms}
              bathrooms={leadData.lead.propertyBathrooms}
              sqft={leadData.lead.propertySqft}
              imageUrl={leadData.lead.propertyImageUrl}
              listingId={leadData.lead.propertyListingId}
              source={leadData.lead.source}
            />
          )}

          {/* Use ProfileDetailsCard for consistent display */}
          <ProfileDetailsCard profile={profile} />

      {/* Agent Actions */}
      <AgentActions 
        profile={profile}
        persona={enhancedPersona}
      />

      {/* Agent Feedback */}
      {enhancedProfile && (
        <AgentFeedback 
          profile={profile}
          tags={enhancedTags}
          persona={enhancedPersona}
        />
      )}

      {/* AI Analysis */}
      {enhancedProfile && (enhancedTags.length > 0 || enhancedPersona) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Behavioral Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TagPersonaDisplay
              tags={enhancedTags}
              persona={enhancedPersona || {
                urgencyLevel: 50,
                personalityTraits: [],
                confidenceScore: 0
              }}
            />
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-6 mt-6">
          <BuyerInsights profileId={profile.id} />
        </TabsContent>

        <TabsContent value="agent-search" className="space-y-6 mt-6">
          <AgentDualViewSearch profile={profile} />
        </TabsContent>

        <TabsContent value="saved" className="mt-6">
          {profile && <SavedPropertiesList profile={profile} />}
        </TabsContent>

        <TabsContent value="lead" className="mt-6">
          <LeadIntelTab profileId={profile.id} />
        </TabsContent>
      </Tabs>

      {/* Report Generator Modal */}
      <ReportGeneratorModal
        profileId={profile.id}
        profileName={profile.name}
        buyerEmail={profile.email}
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
      />
    </div>
  );
}

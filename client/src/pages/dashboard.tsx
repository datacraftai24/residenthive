import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import type { BuyerProfile, ExtractedProfile } from "@shared/schema";
import BuyerForm from "../components/buyer-form";
import ProfileForm from "../components/profile-form";
import ProfileDisplay from "../components/profile-display";
import ProfileViewer from "../components/profile-viewer";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Bell, Home, FormInput, Mic, BarChart3, LogOut } from "lucide-react";
import { useUser, useAuth, SignOutButton } from "@clerk/clerk-react";
import { Link, useLocation } from "wouter";

type ViewMode = "home" | "view-profile" | "extracted-profile";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [extractedProfile, setExtractedProfile] = useState<ExtractedProfile | null>(null);
  const [agent, setAgent] = useState<any>(null);

  // Clerk user
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  // Helper to get agent initials
  function getAgentInitials(agent: any) {
    if (!agent) return "";
    const first = agent.firstName ? agent.firstName[0] : "";
    const last = agent.lastName ? agent.lastName[0] : "";
    return (first + last).toUpperCase() || "A";
  }

  // Logout handler
  function handleLogout() {
    window.location.href = "/sign-out";
  }

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (isLoaded && !user) {
      setLocation("/sign-in");
    }
  }, [isLoaded, user, setLocation]);
  if (isLoaded && !user) return null;
  console.log("Signed-in user:", user);
  // Fetch buyer profiles for the signed-in agent (by email) only after Clerk login is loaded and user is present
  const { data: profiles = [], isLoading, error } = useQuery<BuyerProfile[]>({
    queryKey: ["/api/buyer-profiles", user?.primaryEmailAddress?.emailAddress],
    queryFn: async () => {
      if (!user?.primaryEmailAddress?.emailAddress) {
        throw new Error("User email not available");
      }
      const token = await getToken();
      console.log("Clerk token (frontend):", token);
      if (!token) {
        throw new Error("Clerk session token not available");
      }
      const controller = new AbortController();
      try {
        const response = await fetch("/api/buyer-profiles", {
          headers: {
            "Authorization": `Bearer ${token}`,
            "x-agent-email": user.primaryEmailAddress.emailAddress,
          },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Failed to fetch profiles");
        const data = await response.json();
        console.log("Fetched profiles:", data);
        return data;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("Request timed out");
        }
        throw err;
      }
    },
    enabled: isLoaded && !!user && !!user.primaryEmailAddress?.emailAddress,
    retry: 1,
  });

  // Fetch agent info from Clerk and set to state
  useEffect(() => {
    if (isLoaded && user) {
      // You can customize this mapping as needed
      setAgent({
        firstName: user.firstName || user.username || "Agent",
        lastName: user.lastName || "",
        email: user.primaryEmailAddress?.emailAddress || "",
        brokerageName: user.publicMetadata?.brokerageName || "",
        id: user.id,
      });
    }
  }, [isLoaded, user]);

  if (error) {
    return <div className="text-red-500 p-4">Error: {error.message}</div>;
  }

  const handleProfileExtracted = (profile: ExtractedProfile) => {
    setExtractedProfile(profile);
    setViewMode("extracted-profile");
    setSelectedProfileId(null);
  };

  const handleProfileSaved = () => {
    setExtractedProfile(null);
    setViewMode("home");
  };

  const handleProfileSelected = (profile: BuyerProfile) => {
    setSelectedProfileId(profile.id);
    setViewMode("view-profile");
    setExtractedProfile(null);
  };

  const handleBackToHome = () => {
    setViewMode("home");
    setSelectedProfileId(null);
    setExtractedProfile(null);
  };

  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-slate-50">
      {/* Sidebar for large screens */}
      <div className="hidden lg:block lg:w-64 h-full border-r bg-white">
        <Sidebar
          profiles={profiles}
          isLoading={isLoading}
          selectedProfile={profiles.find((p) => p.id === selectedProfileId) || null}
          onSelectProfile={handleProfileSelected}
          isMobile={false}
        />
      </div>
      {/* Sidebar for mobile screens */}
      <div className="lg:hidden">
        <Sidebar
          profiles={profiles}
          isLoading={isLoading}
          selectedProfile={profiles.find((p) => p.id === selectedProfileId) || null}
          onSelectProfile={handleProfileSelected}
          isMobile={true}
        />
      </div>
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 py-2 sm:py-2 mr-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Buyer Profile Management</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">Create comprehensive buyer profiles with AI-powered insights</p>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Link href="/analytics">
                <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors">
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Analytics</span>
                </button>
              </Link>
              <button className="text-slate-400 hover:text-slate-600 transition-colors">
                <Bell className="h-4 w-4 sm:h-5 sm:w-5 mr-8" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {viewMode === 'view-profile' && selectedProfileId ? (
            <ProfileViewer
              profileId={selectedProfileId}
              onBack={handleBackToHome}
            />
          ) : viewMode === 'extracted-profile' && extractedProfile ? (
            <ProfileDisplay 
              extractedProfile={extractedProfile}
              agent={agent}
              onProfileSaved={handleProfileSaved}
            />
          ) : (
            <div className="max-w-6xl mx-auto space-y-8">
              {/* Profile Creation Tabs */}
              <Tabs defaultValue="form" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="form" className="flex items-center space-x-2">
                    <FormInput className="h-4 w-4" />
                    <span>Structured Form</span>
                  </TabsTrigger>
                  <TabsTrigger value="voice" className="flex items-center space-x-2">
                    <Mic className="h-4 w-4" />
                    <span>Quick Voice/Text</span>
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="form" className="mt-6">
                  <BuyerForm onProfileExtracted={handleProfileExtracted} />
                </TabsContent>
                
                <TabsContent value="voice" className="mt-6">
                  <ProfileForm onProfileExtracted={handleProfileExtracted} />
                </TabsContent>
              </Tabs>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {profiles.slice(0, 3).map((profile) => (
                      <div 
                        key={profile.id} 
                        className="flex items-start space-x-3 py-2 cursor-pointer hover:bg-slate-50 rounded-lg p-2 transition-colors"
                        onClick={() => handleProfileSelected(profile)}
                      >
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Home className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-slate-900">
                            <span className="font-medium">{profile.name}</span> profile created
                          </p>
                          <p className="text-xs text-slate-500">
                            {new Date(profile.createdAt).toRelativeTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    {profiles.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-4">
                        No activity yet. Create your first buyer profile to get started.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

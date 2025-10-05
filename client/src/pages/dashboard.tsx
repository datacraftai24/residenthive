import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser as useAgent, useClerk, useAuth } from "@clerk/clerk-react";
import type { BuyerProfile, ExtractedProfile } from "@shared/schema";
import Sidebar from "@/components/sidebar";
import BuyerForm from "@/components/buyer-form";
import ProfileForm from "@/components/profile-form";
import ProfileDisplay from "@/components/profile-display";
import ProfileViewer from "@/components/profile-viewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Home, FormInput, Mic, BarChart3, LogOut } from "lucide-react";
import { Link } from "wouter";

type ViewMode = 'home' | 'view-profile' | 'extracted-profile';

const Dashboard = () => {
  const { user: agent } = useAgent();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [extractedProfile, setExtractedProfile] = useState<ExtractedProfile | null>(null);

  const { data: profiles = [], isLoading } = useQuery<BuyerProfile[]>({
    queryKey: ["/api/buyer-profiles"],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch("/api/buyer-profiles", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Clerk-User-Id': agent?.id as unknown as string
        }
      });
      if (!response.ok) throw new Error('Failed to fetch profiles');
      return response.json();
    },
    enabled: !!agent // Only fetch when agent is loaded
  });

  const handleLogout = () => {
    signOut({ redirectUrl: '/' });
  };

  const getAgentInitials = () => {
    if (!agent?.firstName || !agent?.lastName) return 'U';
    return `${agent.firstName[0]}${agent.lastName[0]}`.toUpperCase();
  };

  const handleProfileExtracted = (profile: ExtractedProfile) => {
    setExtractedProfile(profile);
    setViewMode('extracted-profile');
    setSelectedProfileId(null);
  };

  const handleProfileSaved = () => {
    setExtractedProfile(null);
    setViewMode('home');
  };

  const handleProfileSelected = (profile: BuyerProfile) => {
    setSelectedProfileId(profile.id);
    setViewMode('view-profile');
    setExtractedProfile(null);
  };

  const handleBackToHome = () => {
    setViewMode('home');
    setSelectedProfileId(null);
    setExtractedProfile(null);
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-slate-50">
      <div className="lg:hidden">
        <Sidebar 
          profiles={profiles}
          isLoading={isLoading}
          selectedProfile={profiles.find(p => p.id === selectedProfileId) || null}
          onSelectProfile={handleProfileSelected}
          isMobile={true}
        />
      </div>
      
      <div className="hidden lg:block">
        <Sidebar 
          profiles={profiles}
          isLoading={isLoading}
          selectedProfile={profiles.find(p => p.id === selectedProfileId) || null}
          onSelectProfile={handleProfileSelected}
          isMobile={false}
        />
      </div>
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4">
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
                <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              
              {/* User Info & Logout - Always present for authenticated users */}
              {agent ? (
                <div className="flex items-center space-x-2">
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-xs font-medium text-slate-700">{agent.firstName} {agent.lastName}</span>
                    <span className="text-xs text-slate-500">{agent.publicMetadata?.brokerageName || 'Agent'}</span>
                  </div>
                  <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs sm:text-sm font-medium">{getAgentInitials()}</span>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                    title="Logout"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <div className="text-xs text-slate-500">Loading...</div>
                </div>
              )}
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
};

export default Dashboard;

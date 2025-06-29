import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BuyerProfile, ExtractedProfile } from "@shared/schema";
import Sidebar from "@/components/sidebar";
import BuyerForm from "@/components/buyer-form";
import ProfileForm from "@/components/profile-form";
import ProfileDisplay from "@/components/profile-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Home, FormInput, Mic } from "lucide-react";

export default function Dashboard() {
  const [selectedProfile, setSelectedProfile] = useState<BuyerProfile | null>(null);
  const [extractedProfile, setExtractedProfile] = useState<ExtractedProfile | null>(null);

  const { data: profiles = [], isLoading } = useQuery<BuyerProfile[]>({
    queryKey: ["/api/buyer-profiles"],
  });

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar 
        profiles={profiles}
        isLoading={isLoading}
        selectedProfile={selectedProfile}
        onSelectProfile={setSelectedProfile}
      />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Buyer Profile Management</h1>
              <p className="text-sm text-slate-500 mt-1">Create comprehensive buyer profiles with AI-powered insights</p>
            </div>
            <div className="flex items-center space-x-3">
              <button className="text-slate-400 hover:text-slate-600 transition-colors">
                <Bell className="h-5 w-5" />
              </button>
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <span className="text-primary-foreground text-sm font-medium">JD</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
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
                <BuyerForm onProfileExtracted={setExtractedProfile} />
              </TabsContent>
              
              <TabsContent value="voice" className="mt-6">
                <ProfileForm onProfileExtracted={setExtractedProfile} />
              </TabsContent>
            </Tabs>
            
            {extractedProfile && (
              <ProfileDisplay 
                extractedProfile={extractedProfile}
                onProfileSaved={() => {
                  setExtractedProfile(null);
                  setSelectedProfile(null);
                }}
              />
            )}

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {profiles.slice(0, 3).map((profile) => (
                    <div key={profile.id} className="flex items-start space-x-3 py-2">
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
        </div>
      </main>
    </div>
  );
}

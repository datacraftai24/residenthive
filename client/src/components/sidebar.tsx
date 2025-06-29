import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Home, Plus, MoreVertical } from "lucide-react";
import type { BuyerProfile } from "@shared/schema";

interface SidebarProps {
  profiles: BuyerProfile[];
  isLoading: boolean;
  selectedProfile: BuyerProfile | null;
  onSelectProfile: (profile: BuyerProfile) => void;
}

export default function Sidebar({ profiles, isLoading, selectedProfile, onSelectProfile }: SidebarProps) {
  return (
    <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm">
      {/* Sidebar Header */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Home className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">RealEstate Pro</h1>
            <p className="text-sm text-slate-500">Buyer Profiles</p>
          </div>
        </div>
      </div>

      {/* Saved Profiles List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-slate-700">Saved Profiles</h2>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
              {profiles.length}
            </span>
          </div>
          
          <div className="space-y-2">
            {isLoading ? (
              // Loading skeletons
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="p-3">
                  <CardContent className="p-0">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/2 mb-2" />
                    <div className="flex space-x-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-12" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : profiles.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-slate-500 mb-4">No buyer profiles yet</p>
                <p className="text-xs text-slate-400">Create your first profile using the form</p>
              </div>
            ) : (
              profiles.map((profile) => (
                <Card 
                  key={profile.id}
                  className={`p-3 cursor-pointer transition-colors hover:bg-slate-50 ${
                    selectedProfile?.id === profile.id ? 'bg-slate-50 border-slate-300' : ''
                  }`}
                  onClick={() => onSelectProfile(profile)}
                >
                  <CardContent className="p-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-slate-900 text-sm">{profile.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">{profile.budget}</p>
                        <div className="flex items-center space-x-2 mt-2">
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            {profile.homeType.replace('-', ' ')}
                          </span>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                            {profile.bedrooms} BR
                          </span>
                        </div>
                      </div>
                      <button className="text-slate-400 hover:text-slate-600 transition-colors">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-slate-200">
        <Button className="w-full" onClick={() => window.location.reload()}>
          <Plus className="h-4 w-4 mr-2" />
          New Profile
        </Button>
      </div>
    </aside>
  );
}

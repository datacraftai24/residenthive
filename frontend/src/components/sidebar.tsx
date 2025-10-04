import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Home, Plus, MoreVertical, Eye, Pencil, Trash } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { BuyerProfile } from "@shared/schema";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface SidebarProps {
  profiles: BuyerProfile[];
  isLoading: boolean;
  selectedProfile: BuyerProfile | null;
  onSelectProfile: (profile: BuyerProfile) => void;
  isMobile?: boolean;
}

export default function Sidebar({ profiles, isLoading, selectedProfile, onSelectProfile, isMobile = false }: SidebarProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/buyer-profiles/${id}`);
    },
    onSuccess: () => {
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/buyer-profiles"] });
    },
  });
  return (
    <aside className={`bg-white border-r border-slate-200 flex flex-col shadow-sm ${
      isMobile ? 'w-full h-auto' : 'w-80'
    }`}>
      {/* Sidebar Header */}
      <div className={`border-b border-slate-200 ${isMobile ? 'p-4' : 'p-6'}`}>
        <div className="flex items-center space-x-3">
          <div className={`bg-primary rounded-lg flex items-center justify-center ${
            isMobile ? 'w-8 h-8' : 'w-10 h-10'
          }`}>
            <Home className={`text-primary-foreground ${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
          </div>
          <div>
            <h1 className={`font-semibold text-slate-900 ${isMobile ? 'text-base' : 'text-lg'}`}>RealEstate Pro</h1>
            <p className={`text-slate-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>Buyer Profiles</p>
          </div>
        </div>
      </div>

      {/* Saved Profiles List */}
      <div className={`flex-1 overflow-y-auto ${isMobile ? 'max-h-48' : ''}`}>
        <div className={`${isMobile ? 'p-3' : 'p-4'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`font-medium text-slate-700 ${isMobile ? 'text-xs' : 'text-sm'}`}>Saved Profiles</h2>
            <span className={`text-slate-500 bg-slate-100 px-2 py-1 rounded-full ${isMobile ? 'text-xs' : 'text-xs'}`}>
              {profiles.length}
            </span>
          </div>
          
          <div className={`space-y-2 ${isMobile ? 'max-h-32 overflow-y-auto' : ''}`}>
            {isLoading ? (
              // Loading skeletons
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className={`${isMobile ? 'p-2' : 'p-3'}`}>
                  <CardContent className="p-0">
                    <Skeleton className={`w-3/4 mb-2 ${isMobile ? 'h-3' : 'h-4'}`} />
                    <Skeleton className={`w-1/2 mb-2 ${isMobile ? 'h-2' : 'h-3'}`} />
                    <div className="flex space-x-2">
                      <Skeleton className={`w-16 ${isMobile ? 'h-4' : 'h-5'}`} />
                      <Skeleton className={`w-12 ${isMobile ? 'h-4' : 'h-5'}`} />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : profiles.length === 0 ? (
              <div className={`text-center ${isMobile ? 'py-4' : 'py-8'}`}>
                <p className={`text-slate-500 mb-4 ${isMobile ? 'text-xs' : 'text-sm'}`}>No buyer profiles yet</p>
                <p className={`text-slate-400 ${isMobile ? 'text-xs' : 'text-xs'}`}>Create your first profile using the form</p>
              </div>
            ) : (
              profiles.map((profile) => (
                <Card 
                  key={profile.id}
                  className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                    selectedProfile?.id === profile.id ? 'bg-slate-50 border-slate-300' : ''
                  } ${isMobile ? 'p-2' : 'p-3'}`}
                  onClick={() => onSelectProfile(profile)}
                >
                  <CardContent className="p-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className={`font-medium text-slate-900 ${isMobile ? 'text-xs' : 'text-sm'}`}>{profile.name}</h3>
                        <p className={`text-slate-500 mt-1 ${isMobile ? 'text-xs' : 'text-xs'}`}>{profile.budget}</p>
                        <div className="flex items-center space-x-2 mt-2">
                          <span className={`bg-blue-100 text-blue-700 px-2 py-0.5 rounded ${isMobile ? 'text-xs' : 'text-xs'}`}>
                            {profile.homeType.replace('-', ' ')}
                          </span>
                          <span className={`bg-green-100 text-green-700 px-2 py-0.5 rounded ${isMobile ? 'text-xs' : 'text-xs'}`}>
                            {profile.bedrooms} BR
                          </span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          <button
                            type="button"
                            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            aria-label="Open profile menu"
                          >
                            <MoreVertical className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          onClick={(e) => {
                            // prevent parent card onClick when selecting menu items
                            e.stopPropagation();
                          }}
                        >
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectProfile(profile);
                            }}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectProfile(profile);
                              window.dispatchEvent(new CustomEvent('open-profile-edit', { detail: profile.id }));
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(profile.id);
                            }}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Delete Profile
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className={`border-t border-slate-200 ${isMobile ? 'p-3' : 'p-4'}`}>
        <Button className={`w-full ${isMobile ? 'text-xs' : ''}`} onClick={() => window.location.reload()}>
          <Plus className={`mr-2 ${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
          New Profile
        </Button>
      </div>
      {/* Delete confirmation */}
      {confirmDeleteId !== null && (
        <div
          className="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
          onClick={() => !deleteMutation.isPending && setConfirmDeleteId(null)}
        >
          <div
            className="bg-white rounded-lg shadow-lg p-4 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1">Delete this profile?</h3>
            <p className="text-sm text-slate-600 mb-4">
              This action cannot be undone. The buyer profile will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => confirmDeleteId != null && deleteMutation.mutate(confirmDeleteId)}
                disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

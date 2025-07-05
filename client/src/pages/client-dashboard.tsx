import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Mail, Star, Home, DollarSign, MapPin, Eye, Heart, Calendar } from "lucide-react";
import { useState } from "react";

interface ShareableProfile {
  shareId: string;
  profileId: number;
  shareUrl: string;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  customMessage?: string;
  showVisualAnalysis?: boolean;
  expiresAt?: string;
  isActive: boolean;
}

interface BuyerProfile {
  id: number;
  name: string;
  email?: string;
  budgetMin?: number;
  budgetMax?: number;
  location?: string;
  bedrooms?: number;
  bathrooms?: number;
  mustHaveFeatures?: string[];
  dealbreakers?: string[];
}

interface ScoredListing {
  listing: any;
  match_score: number;
  label: string;
  matched_features: string[];
  dealbreaker_flags: string[];
  reason: string;
  score_breakdown: {
    budget_score: number;
    feature_score: number;
    dealbreaker_penalty: number;
    location_score: number;
    tag_score: number;
  };
}

export default function ClientDashboard() {
  const { shareId } = useParams();
  const [savedListings, setSavedListings] = useState<Set<string>>(new Set());

  // Fetch shareable profile
  const { data: shareableProfile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ["/api/profiles/share", shareId],
    queryFn: async () => {
      const response = await fetch(`/api/profiles/share/${shareId}`);
      if (!response.ok) throw new Error("Shareable profile not found");
      return response.json() as ShareableProfile;
    },
    enabled: !!shareId
  });

  // Fetch buyer profile
  const { data: profile, isLoading: isLoadingBuyer } = useQuery({
    queryKey: ["/api/buyer-profiles", shareableProfile?.profileId],
    enabled: !!shareableProfile?.profileId
  });

  // Fetch matching listings
  const { data: listings, isLoading: isLoadingListings } = useQuery({
    queryKey: ["/api/listings/search", shareableProfile?.profileId],
    queryFn: async () => {
      const response = await fetch(`/api/listings/search?profileId=${shareableProfile?.profileId}`);
      if (!response.ok) throw new Error("Failed to fetch listings");
      return response.json();
    },
    enabled: !!shareableProfile?.profileId
  });

  const isLoading = isLoadingProfile || isLoadingBuyer || isLoadingListings;

  const toggleSaved = (listingId: string) => {
    setSavedListings(prev => {
      const newSet = new Set(prev);
      if (newSet.has(listingId)) {
        newSet.delete(listingId);
      } else {
        newSet.add(listingId);
      }
      return newSet;
    });
  };

  const formatPrice = (price: number) => {
    if (price >= 1000000) {
      return `$${(price / 1000000).toFixed(1)}M`;
    } else if (price >= 1000) {
      return `$${(price / 1000).toFixed(0)}K`;
    }
    return `$${price.toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-64 w-full" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-96 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!shareableProfile || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2">Dashboard Not Found</h2>
            <p className="text-gray-600 mb-4">This client dashboard may have expired or been removed.</p>
            <Button variant="outline">Contact Your Agent</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const topPicks = listings?.top_picks || [];
  const otherMatches = listings?.other_matches || [];
  const searchSummary = listings?.search_summary || {};

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Property Matches for {profile.name}
              </h1>
              <p className="text-gray-600 mt-1">
                {searchSummary.total_found || 0} properties found • {topPicks.length} top picks
              </p>
            </div>
            
            {shareableProfile.agentName && (
              <Card className="lg:max-w-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <Home className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{shareableProfile.agentName}</h3>
                      <div className="flex gap-3 mt-1">
                        {shareableProfile.agentPhone && (
                          <a href={`tel:${shareableProfile.agentPhone}`} className="text-blue-600 hover:underline flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            <span className="text-xs">{shareableProfile.agentPhone}</span>
                          </a>
                        )}
                        {shareableProfile.agentEmail && (
                          <a href={`mailto:${shareableProfile.agentEmail}`} className="text-blue-600 hover:underline flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            <span className="text-xs">Email</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {shareableProfile.customMessage && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-gray-700">{shareableProfile.customMessage}</p>
            </div>
          )}
        </div>
      </div>

      {/* Search Criteria Summary */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Search Criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span>
                  {profile.budgetMin && profile.budgetMax ? 
                    `${formatPrice(profile.budgetMin)} - ${formatPrice(profile.budgetMax)}` :
                    'Budget flexible'
                  }
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Home className="w-4 h-4 text-blue-600" />
                <span>{profile.bedrooms || 'Any'} bed, {profile.bathrooms || 'Any'} bath</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-600" />
                <span>{profile.location || 'Location flexible'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-600" />
                <span>{profile.mustHaveFeatures?.length || 0} must-have features</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Picks */}
      {topPicks.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 pb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Top Picks for You
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {topPicks.map((scored: ScoredListing, index: number) => (
              <PropertyCard 
                key={scored.listing.id || index}
                scored={scored}
                isSaved={savedListings.has(scored.listing.id)}
                onToggleSaved={() => toggleSaved(scored.listing.id)}
                showVisualAnalysis={shareableProfile.showVisualAnalysis}
                isTopPick={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Other Matches */}
      {otherMatches.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 pb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-gray-500" />
            More Options to Consider
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {otherMatches.map((scored: ScoredListing, index: number) => (
              <PropertyCard 
                key={scored.listing.id || index}
                scored={scored}
                isSaved={savedListings.has(scored.listing.id)}
                onToggleSaved={() => toggleSaved(scored.listing.id)}
                showVisualAnalysis={shareableProfile.showVisualAnalysis}
                isTopPick={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="bg-white border-t mt-12">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-gray-600">
          <p className="text-sm">
            This personalized dashboard was created by {shareableProfile.agentName || 'your agent'}
          </p>
          {shareableProfile.expiresAt && (
            <p className="text-xs mt-1">
              Dashboard expires on {new Date(shareableProfile.expiresAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Property Card Component
function PropertyCard({ 
  scored, 
  isSaved, 
  onToggleSaved, 
  showVisualAnalysis, 
  isTopPick 
}: { 
  scored: ScoredListing;
  isSaved: boolean;
  onToggleSaved: () => void;
  showVisualAnalysis?: boolean;
  isTopPick: boolean;
}) {
  const { listing } = scored;
  const images = Array.isArray(listing.images) ? listing.images : [];
  
  const formatPrice = (price: number) => {
    if (price >= 1000000) {
      return `$${(price / 1000000).toFixed(1)}M`;
    } else if (price >= 1000) {
      return `$${(price / 1000).toFixed(0)}K`;
    }
    return `$${price.toLocaleString()}`;
  };

  return (
    <Card className={`overflow-hidden hover:shadow-lg transition-shadow ${isTopPick ? 'ring-2 ring-yellow-200' : ''}`}>
      {/* Image */}
      <div className="relative">
        <img
          src={images[0] || '/placeholder-property.jpg'}
          alt={listing.title || 'Property'}
          className="w-full h-48 object-cover"
        />
        <div className="absolute top-3 left-3 flex gap-2">
          {isTopPick && (
            <Badge className="bg-yellow-500 text-white">
              <Star className="w-3 h-3 mr-1" />
              Top Pick
            </Badge>
          )}
          <Badge variant={scored.match_score >= 8 ? 'default' : 'secondary'}>
            {Math.round(scored.match_score * 10)}% Match
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-3 right-3 bg-white/80 hover:bg-white"
          onClick={onToggleSaved}
        >
          <Heart className={`w-4 h-4 ${isSaved ? 'fill-red-500 text-red-500' : 'text-gray-600'}`} />
        </Button>
      </div>

      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Price and Basic Info */}
          <div>
            <h3 className="font-semibold text-lg">
              {listing.price ? formatPrice(listing.price) : 'Price on request'}
            </h3>
            <p className="text-sm text-gray-600">
              {listing.bedrooms || '?'} bed • {listing.bathrooms || '?'} bath
              {listing.sqft && ` • ${listing.sqft.toLocaleString()} sqft`}
            </p>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {listing.city || listing.address || 'Location available'}
            </p>
          </div>

          {/* AI Reason */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-600 font-medium mb-1">Why this matches you:</p>
            <p className="text-sm text-gray-700">{scored.reason}</p>
          </div>

          {/* Matched Features */}
          {scored.matched_features.length > 0 && (
            <div>
              <p className="text-xs text-green-600 font-medium mb-1">Matches your preferences:</p>
              <div className="flex flex-wrap gap-1">
                {scored.matched_features.slice(0, 3).map((feature, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {feature}
                  </Badge>
                ))}
                {scored.matched_features.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{scored.matched_features.length - 3} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Visual Analysis (if enabled) */}
          {showVisualAnalysis && (scored as any).visualTagMatches?.length > 0 && (
            <div>
              <p className="text-xs text-blue-600 font-medium mb-1">Visual style match:</p>
              <div className="flex flex-wrap gap-1">
                {(scored as any).visualTagMatches.slice(0, 2).map((tag: string, idx: number) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {tag.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
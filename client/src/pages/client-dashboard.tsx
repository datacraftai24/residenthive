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
      return response.json();
    },
    enabled: !!shareId
  });

  // Fetch buyer profile
  const { data: profile, isLoading: isLoadingBuyer } = useQuery({
    queryKey: ["/api/buyer-profiles", shareableProfile?.profileId],
    queryFn: async () => {
      if (!shareableProfile?.profileId) return null;
      const response = await fetch(`/api/buyer-profiles/${shareableProfile.profileId}`);
      if (!response.ok) throw new Error("Failed to fetch buyer profile");
      return response.json();
    },
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

  if (!shareableProfile || !profile || isLoadingBuyer || isLoadingListings || !profile?.name) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="text-center py-12">
            {isLoadingBuyer || isLoadingListings ? (
              <>
                <h2 className="text-xl font-semibold mb-2">Loading Your Properties</h2>
                <p className="text-gray-600 mb-4">Finding the perfect matches for you...</p>
                <div className="flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold mb-2">Dashboard Not Found</h2>
                <p className="text-gray-600 mb-4">This client dashboard may have expired or been removed.</p>
                <Button variant="outline">Contact Your Agent</Button>
              </>
            )}
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
                Property Matches for {profile?.name || 'Client'}
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
                  {profile?.budgetMin && profile?.budgetMax ? 
                    `${formatPrice(profile.budgetMin)} - ${formatPrice(profile.budgetMax)}` :
                    'Budget flexible'
                  }
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Home className="w-4 h-4 text-blue-600" />
                <span>{profile?.bedrooms || 'Any'} bed, {profile?.bathrooms || 'Any'} bath</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-600" />
                <span>{profile?.location || profile?.preferredAreas?.[0] || 'Location flexible'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-600" />
                <span>{profile?.mustHaveFeatures?.length || 0} must-have features</span>
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
                profile={profile}
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
                profile={profile}
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
  isTopPick,
  profile 
}: { 
  scored: ScoredListing;
  isSaved: boolean;
  onToggleSaved: () => void;
  showVisualAnalysis?: boolean;
  isTopPick: boolean;
  profile?: any;
}) {
  const { listing } = scored;
  
  // Handle MLS images from Repliers CDN
  const getPropertyImages = () => {
    let images: string[] = [];
    
    // Handle different image formats from Repliers API
    if (Array.isArray(listing.images)) {
      images = listing.images;
    } else if (typeof listing.images === 'string') {
      try {
        images = JSON.parse(listing.images);
      } catch {
        images = listing.images ? [listing.images] : [];
      }
    }
    
    // Images are already converted to Repliers CDN URLs by the backend
    return images.filter(Boolean);
  };

  const getPropertyImage = () => {
    const images = getPropertyImages();
    return images.length > 0 ? images[0] : null;
  };

  const formatPrice = (price: number) => {
    if (price >= 1000000) {
      return `$${(price / 1000000).toFixed(1)}M`;
    } else if (price >= 1000) {
      return `$${(price / 1000).toFixed(0)}K`;
    }
    return `$${price.toLocaleString()}`;
  };

  const getMatchPercentage = () => Math.round(scored.match_score * 100);
  
  const getMatchColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  // Generate smart match reasoning like the example
  const generateMatchReasoning = () => {
    const positives = [];
    const negatives = [];
    
    // Add positive matches
    if (scored.matched_features.includes('budget')) positives.push('within budget');
    if (scored.matched_features.includes('location')) positives.push('in preferred area');
    if (scored.matched_features.includes('garage')) positives.push('has garage');
    if (scored.matched_features.includes('pool')) positives.push('has pool');
    if (scored.matched_features.includes('parking')) positives.push('has parking');
    
    // Add negatives based on dealbreakers and missing features
    if (scored.dealbreaker_flags.includes('budget')) negatives.push('over budget');
    if (scored.dealbreaker_flags.includes('location')) negatives.push('outside preferred area');
    
    // Check bedroom/bathroom shortfall
    if (listing.bedrooms && profile.bedrooms && listing.bedrooms < profile.bedrooms) {
      const shortage = profile.bedrooms - listing.bedrooms;
      negatives.push(`${shortage} bedroom(s) short`);
    }
    if (listing.bathrooms && profile.bathrooms && listing.bathrooms < profile.bathrooms) {
      const shortage = profile.bathrooms - listing.bathrooms;
      negatives.push(`${shortage} bathroom(s) short`);
    }

    const reasoning = [];
    if (positives.length > 0) reasoning.push(positives.join(', '));
    if (negatives.length > 0) reasoning.push(`but ${negatives.join(', ')}`);
    
    return reasoning.length > 0 ? `💡 ${reasoning.join('; ')}` : scored.reason;
  };

  const propertyImage = getPropertyImage();
  const matchPercent = getMatchPercentage();

  return (
    <Card className={`overflow-hidden hover:shadow-xl transition-all duration-300 ${isTopPick ? 'ring-2 ring-blue-400 shadow-lg' : ''}`}>
      {/* Image */}
      <div className="relative">
        {propertyImage ? (
          <img
            src={propertyImage}
            alt={listing.address || 'Property'}
            className="w-full h-56 object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjI1NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImdyYWQiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiNmOWZhZmIiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNlNWU3ZWIiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyYWQpIi8+PGNpcmNsZSBjeD0iMjAwIiBjeT0iMTI4IiByPSI0MCIgZmlsbD0iI2Q1ZDdkYiIvPjx0ZXh0IHg9IjIwMCIgeT0iMTM1IiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiM5Y2EzYWYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
            }}
          />
        ) : (
          <div className="w-full h-56 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 bg-gray-300 rounded-full mx-auto mb-2 flex items-center justify-center">
                <span className="text-gray-500 text-xl">🏠</span>
              </div>
              <span className="text-gray-500 text-sm">No Image Available</span>
            </div>
          </div>
        )}
        
        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          {isTopPick && (
            <Badge className="bg-blue-600 text-white font-medium">⭐ Top Pick</Badge>
          )}
          <Badge className={`font-medium ${getMatchColor(matchPercent)}`}>
            {matchPercent}% Match
          </Badge>
        </div>

        {/* Save button */}
        <button
          onClick={onToggleSaved}
          className="absolute top-3 right-3 p-2 bg-white/90 backdrop-blur-sm rounded-full hover:bg-white transition-colors"
        >
          <Heart className={`w-5 h-5 ${isSaved ? 'fill-red-500 text-red-500' : 'text-gray-600'}`} />
        </button>
      </div>

      {/* Content */}
      <div className="p-5">
        {/* Price and basic info */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {formatPrice(listing.price)}
            </div>
            <div className="text-sm text-gray-600 flex items-center gap-3">
              <span>{listing.bedrooms || 0} bds</span>
              <span>•</span>
              <span>{listing.bathrooms || 0} ba</span>
              <span>•</span>
              <span className="text-green-600 font-medium">Active</span>
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="mb-3">
          <p className="text-gray-700 font-medium text-sm">
            {listing.address}, {listing.city}, {listing.state} {listing.zip_code}
          </p>
          {listing.mls_number && (
            <p className="text-xs text-gray-500 mt-1">MLS #{listing.mls_number}</p>
          )}
        </div>

        {/* Match reasoning */}
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-sm text-gray-700 leading-relaxed">
            {generateMatchReasoning()}
          </p>
        </div>

        {/* Property features */}
        {scored.matched_features.length > 0 && (
          <div className="mb-3">
            <div className="flex flex-wrap gap-1">
              {scored.matched_features.slice(0, 3).map((feature, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs bg-green-100 text-green-700">
                  ✓ {feature}
                </Badge>
              ))}
              {scored.matched_features.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{scored.matched_features.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-3 border-t border-gray-100">
          <Button variant="outline" size="sm" className="flex-1">
            View Details
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            Schedule Tour
          </Button>
        </div>
      </div>
    </Card>
  );
}
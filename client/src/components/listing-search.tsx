import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Search, Star, MapPin, DollarSign, Home, AlertCircle, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { getDisplayScore, validateScoreBreakdown } from '@/lib/score-utils';
import ChatLinkGenerator from '@/components/chat-link-generator';

interface ScoredListing {
  listing: {
    id: string;
    price: number;
    bedrooms: number;
    bathrooms: number;
    property_type: string;
    address: string;
    city: string;
    state: string;
    square_feet?: number;
    description?: string;
    features?: string[];
  };
  match_score: number;
  label: string;
  matched_features: string[];
  dealbreaker_flags: string[];
  reason: string;
  score_breakdown: {
    feature_match: number;
    budget_match: number;
    bedroom_match: number;
    location_match: number;
    visual_tag_match: number;
    behavioral_tag_match: number;
    listing_quality_score: number;
    dealbreaker_penalty: number;
    missing_data_penalty: number;
    visual_boost: number;
    raw_total: number;
    final_score: number;
    // Legacy support
    budget_score?: number;
    feature_score?: number;
    location_score?: number;
    tag_score?: number;
  };
}

interface SearchResults {
  top_picks: ScoredListing[];
  other_matches: ScoredListing[];
  chat_blocks: string[];
  search_summary: {
    total_found: number;
    top_picks_count: number;
    other_matches_count: number;
    search_criteria: {
      budget: string;
      bedrooms: number;
      property_type: string;
      location: any;
    };
  };
}

interface ListingSearchProps {
  profileId: number;
  profileName: string;
}

export default function ListingSearch({ profileId, profileName }: ListingSearchProps) {
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [showChatBlocks, setShowChatBlocks] = useState(false);

  // Get buyer profile details for chat link generation
  const { data: buyerProfile } = useQuery({
    queryKey: ["/api/buyer-profiles", profileId],
    queryFn: async () => {
      const response = await fetch(`/api/buyer-profiles/${profileId}`);
      if (!response.ok) throw new Error("Failed to fetch profile");
      return response.json();
    },
    enabled: !!profileId
  });
  const queryClient = useQueryClient();

  const searchMutation = useMutation({
    mutationFn: async (): Promise<SearchResults> => {
      const response = await fetch('/api/listings/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profileId }),
      });
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }
      
      return await response.json();
    },
    onSuccess: (data: SearchResults) => {
      setSearchResults(data);
    }
  });

  const handleSearch = () => {
    searchMutation.mutate();
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(price);
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.85) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 0.75) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (score >= 0.65) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const ListingCard = ({ scoredListing }: { scoredListing: ScoredListing }) => {
    const { listing, match_score, label, matched_features, reason, score_breakdown } = scoredListing;
    
    return (
      <Card className="mb-4">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-lg">
                {listing.bedrooms}BR/{listing.bathrooms}BA {listing.property_type}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <MapPin className="h-4 w-4" />
                {listing.address}, {listing.city}, {listing.state}
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">
                {formatPrice(listing.price)}
              </div>
              <Badge className={`mt-1 ${getScoreColor(match_score)}`}>
                {label} ({(match_score * 100).toFixed(0)}%)
              </Badge>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {listing.square_feet && (
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <Home className="h-4 w-4" />
              {listing.square_feet.toLocaleString()} sq ft
            </div>
          )}
          
          {listing.description && (
            <div className="mb-3">
              <h4 className="font-medium text-sm mb-1">Description:</h4>
              <p className="text-sm text-gray-600 line-clamp-3">{listing.description}</p>
            </div>
          )}
          
          {matched_features.length > 0 && (
            <div className="mb-3">
              <h4 className="font-medium text-sm mb-2">✅ Matched Features:</h4>
              <div className="flex flex-wrap gap-1">
                {matched_features.map((feature, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {feature}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          <div className="mb-3">
            <h4 className="font-medium text-sm mb-1">🤖 Why we picked this:</h4>
            <p className="text-sm text-gray-600">{reason}</p>
          </div>
          
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer hover:text-gray-700">Score Breakdown</summary>
            <div className="mt-2 space-y-1">
              <div>Budget: {Math.round(score_breakdown.budget_match || 0)}pts</div>
              <div>Features: {Math.round(score_breakdown.feature_match || 0)}pts</div>
              <div>Location: {Math.round(score_breakdown.location_match || 0)}pts</div>
              <div>Behavioral: {Math.round(score_breakdown.behavioral_tag_match || 0)}pts</div>
              {(score_breakdown.visual_tag_match || 0) > 0 && (
                <div>Visual: {Math.round(score_breakdown.visual_tag_match)}pts</div>
              )}
              {(score_breakdown.listing_quality_score || 0) > 0 && (
                <div>Quality: {Math.round(score_breakdown.listing_quality_score)}pts</div>
              )}
              {(score_breakdown.dealbreaker_penalty || 0) < 0 && (
                <div className="text-red-600">
                  Dealbreakers: {Math.round(score_breakdown.dealbreaker_penalty)}pts
                </div>
              )}
              {(score_breakdown.missing_data_penalty || 0) < 0 && (
                <div className="text-orange-600">
                  Missing Data: {Math.round(score_breakdown.missing_data_penalty)}pts
                </div>
              )}
              {(score_breakdown.visual_boost || 0) > 0 && (
                <div className="text-green-600">
                  Visual Boost: +{Math.round(score_breakdown.visual_boost)}pts
                </div>
              )}
              <div className="font-medium border-t pt-1">
                Final Score: {Math.round(score_breakdown.final_score || 0)}/100
              </div>
            </div>
          </details>
          
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="flex-1">
              🔗 View Listing
            </Button>
            <Button size="sm" variant="outline" className="flex-1">
              ❤️ Save
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Smart Listing Search</h2>
          <p className="text-gray-600">Find properties matching {profileName}'s preferences</p>
        </div>
        <Button 
          onClick={handleSearch} 
          disabled={searchMutation.isPending}
          className="flex items-center gap-2"
        >
          {searchMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Search Listings
        </Button>
      </div>

      {searchMutation.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <span>Search failed. Please check your API connection and try again.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {searchResults && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {searchResults.search_summary.total_found}
                  </div>
                  <div className="text-sm text-gray-600">Total Found</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {searchResults.search_summary.top_picks_count}
                  </div>
                  <div className="text-sm text-gray-600">Top Picks</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-600">
                    {searchResults.search_summary.other_matches_count}
                  </div>
                  <div className="text-sm text-gray-600">Other Matches</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">
                    {searchResults.chat_blocks.length}
                  </div>
                  <div className="text-sm text-gray-600">Chat Blocks</div>
                </div>
              </div>
              
              <Separator className="my-4" />
              
              <div className="text-sm space-y-1">
                <div><strong>Budget:</strong> {searchResults.search_summary.search_criteria.budget}</div>
                <div><strong>Bedrooms:</strong> {searchResults.search_summary.search_criteria.bedrooms}</div>
                <div><strong>Property Type:</strong> {searchResults.search_summary.search_criteria.property_type}</div>
                <div><strong>Location:</strong> {JSON.stringify(searchResults.search_summary.search_criteria.location)}</div>
              </div>
            </CardContent>
          </Card>

          {/* Chat Link Generator */}
          <ChatLinkGenerator 
            profileId={profileId}
            profileName={buyerProfile?.name || profileName}
            propertyCount={searchResults.search_summary.total_found}
          />

          {searchResults.top_picks.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                Top Picks ({searchResults.top_picks.length})
              </h3>
              {searchResults.top_picks.map((scoredListing) => (
                <ListingCard key={scoredListing.listing.id} scoredListing={scoredListing} />
              ))}
            </div>
          )}

          {searchResults.other_matches.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Home className="h-5 w-5 text-blue-500" />
                Other Matches ({searchResults.other_matches.length})
              </h3>
              {searchResults.other_matches.map((scoredListing) => (
                <ListingCard key={scoredListing.listing.id} scoredListing={scoredListing} />
              ))}
            </div>
          )}

          {searchResults.chat_blocks.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold">Chat-Ready Blocks</h3>
                <Button 
                  variant="outline" 
                  onClick={() => setShowChatBlocks(!showChatBlocks)}
                >
                  {showChatBlocks ? 'Hide' : 'Show'} Chat Format
                </Button>
              </div>
              
              {showChatBlocks && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      {searchResults.chat_blocks.map((block, idx) => (
                        <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                          <pre className="whitespace-pre-wrap text-sm font-mono">
                            {block}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
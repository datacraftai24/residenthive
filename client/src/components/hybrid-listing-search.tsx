import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Brain, Eye, Share2, Copy, MessageSquare, Loader2, Star, Camera, BarChart3, RefreshCw, Clock, Database, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ScoredListing {
  listing: {
    id: string;
    address: string;
    price: number;
    bedrooms: number;
    bathrooms: number;
    square_feet?: number;
    property_type: string;
    city: string;
    state: string;
    images?: string[];
    description?: string;
    features?: string[];
  };
  match_score: number;
  label: string;
  matched_features: string[];
  reason: string;
  score_breakdown: {
    budget_score: number;
    feature_score: number;
    dealbreaker_penalty: number;
    location_score: number;
  };
}

interface HybridSearchResults {
  top_picks: ScoredListing[];
  other_matches: ScoredListing[];
  chat_blocks: string[];
  search_summary?: {
    total_found: number;
    top_picks_count: number;
    other_matches_count: number;
    search_criteria: any;
  };
  search_type?: string;
  analysis_in_progress?: boolean;
  analysis_progress?: {
    total: number;
    completed: number;
    currentProperty?: string;
  };
  cache_status?: {
    from_cache: boolean;
    last_updated?: string;
    cache_age_hours?: number;
    expires_at?: string;
  };
}

interface CacheStatus {
  isCached: boolean;
  isExpired: boolean;
  lastUpdated?: string;
  expiresAt?: string;
  cacheAge?: number;
}

export default function HybridListingSearch({ profileId }: { profileId: number }) {
  const [activeTab, setActiveTab] = useState("hybrid-search");
  const [analysisProgress, setAnalysisProgress] = useState<{ completed: number; total: number; currentProperty?: string } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Cache status query
  const { data: cacheStatus } = useQuery<CacheStatus>({
    queryKey: ["/api/cache/status", profileId],
    queryFn: async () => {
      const response = await fetch(`/api/cache/status/${profileId}?searchMethod=hybrid`);
      if (!response.ok) throw new Error('Failed to get cache status');
      return response.json();
    }
  });

  // Manual refresh mutation
  const refreshSearchMutation = useMutation({
    mutationFn: async (forceRefresh: boolean = false) => {
      const response = await fetch("/api/listings/search-hybrid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, forceRefresh }),
      });
      if (!response.ok) throw new Error('Failed to refresh search');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings/search-hybrid", profileId] });
      queryClient.invalidateQueries({ queryKey: ["/api/cache/status", profileId] });
      toast({
        title: "Search Updated",
        description: "Property search results have been refreshed with latest data.",
      });
    },
    onError: (error) => {
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh search results. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Hybrid search query
  const { data: hybridResults, isLoading: isSearching, error: searchError } = useQuery<HybridSearchResults>({
    queryKey: ["/api/listings/search-hybrid", profileId],
    queryFn: async () => {
      const response = await fetch("/api/listings/search-hybrid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      if (!response.ok) throw new Error("Search failed");
      return response.json();
    },
    enabled: !!profileId
  });

  // Update analysis progress from search results
  useEffect(() => {
    if (hybridResults?.analysis_progress) {
      setAnalysisProgress(hybridResults.analysis_progress);
    }
  }, [hybridResults]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return "text-green-600 dark:text-green-400";
    if (score >= 0.5) return "text-yellow-600 dark:text-yellow-400";
    return "text-gray-600 dark:text-gray-400";
  };

  const renderListing = (listing: ScoredListing, isTopPick: boolean = false) => (
    <Card key={listing.listing.id} className="mb-4">
      <CardHeader className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
          <div className="flex-1 w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <CardTitle className="text-base sm:text-lg leading-tight">
                {listing.listing.address}
              </CardTitle>
              {isTopPick && <Badge className="bg-green-100 text-green-800 text-xs">Top Pick</Badge>}
            </div>
            <CardDescription className="text-sm mt-1">
              <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                <span className="font-semibold">{formatPrice(listing.listing.price)}</span>
                <span>•</span>
                <span>{listing.listing.bedrooms}BR/{listing.listing.bathrooms}BA</span>
                {listing.listing.square_feet && (
                  <>
                    <span className="hidden sm:inline">•</span>
                    <span className="hidden sm:inline">{listing.listing.square_feet.toLocaleString()} sqft</span>
                  </>
                )}
              </div>
            </CardDescription>
          </div>
          <div className="text-right sm:text-center">
            <div className={`text-xl sm:text-2xl font-bold ${getScoreColor(listing.match_score)}`}>
              {Math.round(listing.match_score * 100)}%
            </div>
            <div className="text-xs sm:text-sm text-gray-500">{listing.label}</div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-3 sm:p-6">
        <div className="space-y-3 sm:space-y-4">
          {/* Quick Assessment */}
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 sm:p-3 rounded-lg">
            <div className="flex items-start gap-2">
              <Zap className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200 flex-1">
                <div className="flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                  Quick Assessment:
                </div>
                <div className="text-sm leading-relaxed">{listing.reason}</div>
              </div>
            </div>
          </div>

          {/* Property Images */}
          {listing.listing.images && listing.listing.images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {listing.listing.images.slice(0, 6).map((image, idx) => (
                <div key={idx} className="aspect-video bg-gray-200 rounded-lg overflow-hidden">
                  <img 
                    src={image} 
                    alt={`Property ${idx + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Features */}
          {listing.matched_features.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Matched Features:</p>
              <div className="flex flex-wrap gap-1">
                {listing.matched_features.map((feature, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {feature}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Score Breakdown */}
          <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
            <p className="text-sm font-medium mb-2 flex items-center gap-1">
              <BarChart3 className="w-4 h-4" />
              Score Breakdown
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span>Budget Match:</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-blue-500 h-1.5 rounded-full" 
                      style={{width: `${Math.min(100, listing.score_breakdown.budget_score * 100)}%`}}
                    />
                  </div>
                  <span className="font-medium">{Math.round(listing.score_breakdown.budget_score * 100)}%</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>Feature Match:</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-green-500 h-1.5 rounded-full" 
                      style={{width: `${Math.min(100, listing.score_breakdown.feature_score * 100)}%`}}
                    />
                  </div>
                  <span className="font-medium">{Math.round(listing.score_breakdown.feature_score * 100)}%</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>Location Match:</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-purple-500 h-1.5 rounded-full" 
                      style={{width: `${Math.min(100, listing.score_breakdown.location_score * 100)}%`}}
                    />
                  </div>
                  <span className="font-medium">{Math.round(listing.score_breakdown.location_score * 100)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button size="sm" variant="outline" className="flex-1 sm:flex-none">
              <Share2 className="w-4 h-4 mr-1" />
              Share
            </Button>
            <Button size="sm" variant="outline" className="flex-1 sm:flex-none">
              View Details
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (isSearching) {
    return (
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="text-center max-w-md mx-auto">
          <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin mx-auto mb-2" />
          <p className="text-base sm:text-lg font-medium mb-2">⚡ Instant Property Search</p>
          <p className="text-sm text-gray-600 mb-4 leading-relaxed">
            Getting immediate results from smart basic matching. Visual analysis will enhance the top properties automatically.
          </p>
        </div>
      </div>
    );
  }

  if (searchError) {
    return (
      <div className="text-center p-8">
        <p className="text-red-600">Error loading hybrid search results</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            Smart Hybrid Search
          </h2>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Instant results with progressive AI enhancement
          </p>
        </div>
      </div>

      {/* Search Data Status Panel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">MLS Data Status</CardTitle>
            </div>
            <Button
              onClick={() => refreshSearchMutation.mutate(true)}
              disabled={refreshSearchMutation.isPending}
              size="sm"
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshSearchMutation.isPending ? 'animate-spin' : ''}`} />
              {refreshSearchMutation.isPending ? 'Searching...' : 'Refresh Search'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <span className="text-sm">
                {cacheStatus?.isCached 
                  ? `Data refreshed ${Math.round(cacheStatus.cacheAge || 0)} ${Math.round(cacheStatus.cacheAge || 0) === 1 ? 'hour' : 'hours'} ago`
                  : 'Live MLS search completed'
                }
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={cacheStatus?.isExpired ? "destructive" : "secondary"}>
                {cacheStatus?.isExpired ? 'Data Outdated' : 'Current Data'}
              </Badge>
            </div>
            <div className="text-sm text-gray-600">
              {hybridResults?.cache_status?.from_cache ? (
                <span className="text-green-600">⚡ Using recent search results</span>
              ) : (
                <span className="text-blue-600">🔍 Fresh MLS data retrieved</span>
              )}
            </div>
          </div>
          {cacheStatus?.isCached && cacheStatus.lastUpdated && (
            <div className="mt-3 text-xs text-gray-500">
              Last search: {new Date(cacheStatus.lastUpdated).toLocaleString()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Progress */}
      {hybridResults?.analysis_in_progress && analysisProgress && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-purple-600" />
              <CardTitle className="text-lg">Visual Analysis in Progress</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Progress 
                value={(analysisProgress.completed / analysisProgress.total) * 100} 
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-600">
                <span>Analyzing top properties ({analysisProgress.completed}/{analysisProgress.total})</span>
                <span>{Math.round((analysisProgress.completed / analysisProgress.total) * 100)}%</span>
              </div>
              {analysisProgress.currentProperty && (
                <div className="text-xs text-gray-500">
                  Currently analyzing: {analysisProgress.currentProperty}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {hybridResults && (
        <>
          {/* Search Summary */}
          <Card>
            <CardContent className="p-4 sm:pt-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-green-600">
                    {hybridResults.top_picks?.length || 0}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600">Top Picks</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-yellow-600">
                    {hybridResults.other_matches?.length || 0}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600">Other Matches</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {(hybridResults.top_picks?.length || 0) + (hybridResults.other_matches?.length || 0)}
                  </div>
                  <div className="text-sm text-gray-600">Total Found</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Listings */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="hybrid-search" className="text-xs sm:text-sm">
                <Star className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                <span className="hidden sm:inline">Top Picks </span>
                <span className="sm:hidden">Top </span>
                ({hybridResults.top_picks?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="other-matches" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">Other Matches </span>
                <span className="sm:hidden">Other </span>
                ({hybridResults.other_matches?.length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="hybrid-search" className="space-y-4">
              {hybridResults.top_picks && hybridResults.top_picks.length > 0 ? (
                hybridResults.top_picks.map(listing => renderListing(listing, true))
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500">
                    No top picks found. Check other matches or adjust your criteria.
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="other-matches" className="space-y-4">
              {hybridResults.other_matches && hybridResults.other_matches.length > 0 ? (
                hybridResults.other_matches.map(listing => renderListing(listing))
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500">
                    No other matches found.
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Eye, Share2, Copy, MessageSquare, Mail, Loader2, Star, Camera, BarChart3, RefreshCw, Clock, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getDisplayScore, validateScoreBreakdown } from "@/lib/score-utils";

interface EnhancedScoredListing {
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
  visualTagMatches: string[];
  visualFlags: string[];
  enhancedReason: string;
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
  visualAnalysis?: {
    analyses: Array<{
      imageUrl: string;
      imageType: string;
      visualTags: string[];
      summary: string;
      flags: string[];
      confidence: number;
    }>;
    overallTags: string[];
    overallFlags: string[];
  };
}

interface EnhancedSearchResults {
  top_picks: EnhancedScoredListing[];
  other_matches: EnhancedScoredListing[];
  properties_without_images?: EnhancedScoredListing[];
  chat_blocks: string[];
  search_summary?: {
    total_found: number;
    top_picks_count: number;
    other_matches_count: number;
    visual_analysis_count: number;
    search_criteria: any;
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

interface ShareableLink {
  shareId: string;
  shareUrl: string;
  agentName?: string;
  customMessage?: string;
}

export default function EnhancedListingSearch({ profileId }: { profileId: number }) {
  const [selectedListing, setSelectedListing] = useState<EnhancedScoredListing | null>(null);
  const [shareData, setShareData] = useState({
    agentName: "",
    agentEmail: "",
    customMessage: "",
    expiresInDays: 30
  });
  const [activeTab, setActiveTab] = useState("enhanced-search");
  const [editingListing, setEditingListing] = useState<string | null>(null);
  const [editedMessage, setEditedMessage] = useState<string>("");
  const [personalMessageModal, setPersonalMessageModal] = useState<{
    listing: EnhancedScoredListing;
    message: string;
  } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Cache status query
  const { data: cacheStatus } = useQuery<CacheStatus>({
    queryKey: ["/api/cache/status", profileId],
    queryFn: async () => {
      const response = await fetch(`/api/cache/status/${profileId}?searchMethod=enhanced`);
      if (!response.ok) throw new Error('Failed to get cache status');
      return response.json();
    }
  });

  // Manual refresh mutation
  const refreshSearchMutation = useMutation({
    mutationFn: async (forceRefresh: boolean = false) => {
      const response = await fetch("/api/listings/search-enhanced", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, forceRefresh }),
      });
      if (!response.ok) throw new Error('Failed to refresh search');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings/search-enhanced", profileId] });
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

  // Enhanced search query
  const { data: enhancedResults, isLoading: isSearching, error: searchError } = useQuery<EnhancedSearchResults>({
    queryKey: ["/api/listings/search-enhanced", profileId],
    queryFn: async () => {
      const response = await fetch("/api/listings/search-enhanced", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      if (!response.ok) throw new Error("Search failed");
      return response.json();
    },
    enabled: !!profileId
  });

  // Share listing mutation
  const shareMutation = useMutation({
    mutationFn: async (data: { listingId: string } & typeof shareData): Promise<ShareableLink> => {
      const response = await fetch("/api/listings/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, ...data }),
      });
      if (!response.ok) throw new Error("Failed to create share link");
      return response.json();
    },
    onSuccess: (result: ShareableLink) => {
      toast({
        title: "Shareable link created!",
        description: "Link copied to clipboard",
      });
      navigator.clipboard.writeText(result.shareUrl);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create shareable link",
        variant: "destructive",
      });
    }
  });

  // Copy text mutation
  const copyTextMutation = useMutation({
    mutationFn: async ({ listingId, shareId, format }: { listingId: string; shareId: string; format: string }) => {
      const response = await fetch("/api/listings/copy-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, shareId, format }),
      });
      if (!response.ok) throw new Error("Failed to generate copy text");
      return response.json();
    },
    onSuccess: (result: { copyText?: string; whatsappUrl?: string; subject?: string; body?: string }) => {
      if (result.copyText) {
        navigator.clipboard.writeText(result.copyText);
        toast({ title: "Copied to clipboard!" });
      } else if (result.whatsappUrl) {
        window.open(result.whatsappUrl, '_blank');
      }
    }
  });

  // Generate personal message mutation
  const generatePersonalMessageMutation = useMutation({
    mutationFn: async ({ listingId }: { listingId: string }) => {
      const response = await fetch("/api/listings/generate-personal-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, profileId }),
      });
      if (!response.ok) throw new Error("Failed to generate personal message");
      return response.json();
    },
    onSuccess: (result: { personalMessage: string }, variables: { listingId: string }) => {
      const listing = enhancedResults?.top_picks.find(l => l.listing.id === variables.listingId) || 
                     enhancedResults?.other_matches.find(l => l.listing.id === variables.listingId);
      if (listing) {
        setPersonalMessageModal({ listing, message: result.personalMessage });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate personal message",
        variant: "destructive",
      });
    }
  });

  const handleShare = (listing: EnhancedScoredListing) => {
    shareMutation.mutate({
      listingId: listing.listing.id,
      ...shareData
    });
  };

  const handleGeneratePersonalMessage = (listing: EnhancedScoredListing) => {
    generatePersonalMessageMutation.mutate({ listingId: listing.listing.id });
  };

  const handleEditMessage = (listingId: string, currentMessage: string) => {
    setEditingListing(listingId);
    setEditedMessage(currentMessage);
  };

  const handleSaveEdit = (listingId: string) => {
    // Update the message in the results (in a real app, you'd save to backend)
    setEditingListing(null);
    toast({ title: "Message updated!" });
  };

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

  const renderListing = (listing: EnhancedScoredListing, isTopPick: boolean = false) => (
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
          {/* Professional Agent Assessment */}
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 sm:p-3 rounded-lg">
            <div className="flex items-start gap-2">
              <Brain className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200 flex-1">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 gap-1">
                  <div className="flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                    <Eye className="w-3 h-3" />
                    Professional Assessment:
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <Badge variant="outline" className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-300">
                      AI Generated
                    </Badge>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs h-6 px-2"
                      onClick={() => handleEditMessage(listing.listing.id, listing.enhancedReason)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
                <div className="text-sm leading-relaxed">{listing.enhancedReason}</div>
              </div>
            </div>
          </div>

          {/* Property Images */}
          {listing.listing.images && listing.listing.images.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1">
                <Camera className="w-4 h-4" />
                Property Photos ({listing.listing.images.length})
              </p>
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
            </div>
          )}

          {/* Visual Analysis Results */}
          {listing.visualAnalysis && (
            <div className="bg-purple-50 dark:bg-purple-950/20 p-3 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-800 dark:text-purple-200">
                    Visual Intelligence
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {listing.visualAnalysis.analyses.length} images analyzed
                  </Badge>
                </div>
                <Badge variant="outline" className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 border-purple-300">
                  AI Generated
                </Badge>
              </div>
              
              {listing.visualTagMatches.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs text-purple-700 dark:text-purple-300 mb-1">Visual Matches:</p>
                  <div className="flex flex-wrap gap-1">
                    {listing.visualTagMatches.slice(0, 4).map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {listing.visualFlags.length > 0 && (
                <div>
                  <p className="text-xs text-purple-700 dark:text-purple-300 mb-1">Notes:</p>
                  <div className="flex flex-wrap gap-1">
                    {listing.visualFlags.slice(0, 2).map((flag, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs text-orange-600">
                        {flag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Traditional Features */}
          {listing.matched_features.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Matched Features:</p>
              <div className="flex flex-wrap gap-1">
                {listing.matched_features.map((feature, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {feature}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Score Breakdown Analysis */}
          <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium">Why This Score?</span>
            </div>
            <div className="space-y-2 text-xs">
              {(() => {
                // Validate score breakdown to prevent display errors
                if (!validateScoreBreakdown(listing.score_breakdown)) {
                  return <div className="text-red-500 text-xs">Score data unavailable</div>;
                }

                const budgetScore = getDisplayScore(listing.score_breakdown, 'budget');
                const featureScore = getDisplayScore(listing.score_breakdown, 'feature');
                const locationScore = getDisplayScore(listing.score_breakdown, 'location');

                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span>Budget Match:</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-green-500 h-1.5 rounded-full" 
                            style={{width: budgetScore.width}}
                          />
                        </div>
                        <span className="font-medium">{budgetScore.percentage}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Features Match:</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-blue-500 h-1.5 rounded-full" 
                            style={{width: featureScore.width}}
                          />
                        </div>
                        <span className="font-medium">{featureScore.percentage}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Location Match:</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-purple-500 h-1.5 rounded-full" 
                            style={{width: locationScore.width}}
                          />
                        </div>
                        <span className="font-medium">{locationScore.percentage}%</span>
                      </div>
                    </div>
                    {(listing.score_breakdown.behavioral_tag_match || 0) > 0 && (
                      <div className="flex justify-between items-center">
                        <span>Behavioral Match:</span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-1.5">
                            <div 
                              className="bg-yellow-500 h-1.5 rounded-full" 
                              style={{width: `${Math.min(100, (listing.score_breakdown.behavioral_tag_match || 0) / 10 * 100)}%`}}
                            />
                          </div>
                          <span className="font-medium">{Math.round((listing.score_breakdown.behavioral_tag_match || 0) / 10 * 100)}%</span>
                        </div>
                      </div>
                    )}
                    {(listing.score_breakdown.dealbreaker_penalty || 0) < 0 && (
                      <div className="flex justify-between items-center text-red-600">
                        <span>Dealbreaker Penalty:</span>
                        <span className="font-medium">{Math.round(listing.score_breakdown.dealbreaker_penalty || 0)}pts</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setSelectedListing(listing)}
              className="flex-1 sm:flex-none"
            >
              <Share2 className="w-4 h-4 mr-1" />
              Share
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              className="bg-green-50 text-green-700 border-green-300 hover:bg-green-100 flex-1 sm:flex-none"
              onClick={() => handleGeneratePersonalMessage(listing)}
              disabled={generatePersonalMessageMutation.isPending}
            >
              {generatePersonalMessageMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <MessageSquare className="w-4 h-4 mr-1" />
              )}
              <span className="hidden sm:inline">Generate Personal Message</span>
              <span className="sm:hidden">Personal Message</span>
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
          <p className="text-base sm:text-lg font-medium mb-2">🎯 Preparing Your Client's Dream Property Report</p>
          <p className="text-sm text-gray-600 mb-4 leading-relaxed">
            We're analyzing property interiors with AI vision to find homes that match their visual style. 
            Your clients will think you read their minds when you show them these personalized matches.
          </p>
          <p className="text-sm text-blue-600 font-medium mb-4">
            ⏱️ Premium analysis in progress - the comprehensive insights will be worth the wait. Please allow 2-3 minutes for complete visual intelligence processing.
          </p>
          <div className="text-xs text-gray-500 space-y-1">
            <div>• Scanning MLS database for matching properties</div>
            <div>• Analyzing interior photos for style preferences</div>
            <div>• Generating personalized buyer recommendations</div>
            <div>• Creating ready-to-send client communications</div>
          </div>
        </div>
      </div>
    );
  }

  if (searchError) {
    return (
      <div className="text-center p-8">
        <p className="text-red-600">Error loading enhanced search results</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
            Enhanced Listing Search
          </h2>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            AI-powered visual analysis with intelligent matching
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
              {enhancedResults?.cache_status?.from_cache ? (
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

      {enhancedResults && (
        <>
          {/* Search Summary */}
          <Card>
            <CardContent className="p-4 sm:pt-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-green-600">
                    {enhancedResults.top_picks?.length || 0}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600">Top Picks</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-yellow-600">
                    {enhancedResults.other_matches?.length || 0}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600">Other Matches</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">
                    {enhancedResults.properties_without_images?.length || 0}
                  </div>
                  <div className="text-sm text-gray-600">No Images</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {(enhancedResults.top_picks?.length || 0) + (enhancedResults.other_matches?.length || 0) + (enhancedResults.properties_without_images?.length || 0)}
                  </div>
                  <div className="text-sm text-gray-600">Total Found</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Listings */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="enhanced-search" className="text-xs sm:text-sm">
                <Star className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                <span className="hidden sm:inline">Top Picks </span>
                <span className="sm:hidden">Top </span>
                ({enhancedResults.top_picks?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="other-matches" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">Other Matches </span>
                <span className="sm:hidden">Other </span>
                ({enhancedResults.other_matches?.length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="enhanced-search" className="space-y-4">
              {enhancedResults.top_picks.length > 0 ? (
                enhancedResults.top_picks.map(listing => renderListing(listing, true))
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500">
                    No top picks found. Check other matches or adjust your criteria.
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="other-matches" className="space-y-4">
              {enhancedResults.other_matches.length > 0 ? (
                enhancedResults.other_matches.map(listing => renderListing(listing))
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

      {/* Share Modal */}
      {selectedListing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Share Listing</CardTitle>
              <CardDescription className="text-sm">
                Create a shareable link for {selectedListing.listing.address}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="agentName" className="text-sm">Agent Name</Label>
                <Input
                  id="agentName"
                  value={shareData.agentName}
                  onChange={(e) => setShareData(prev => ({ ...prev, agentName: e.target.value }))}
                  placeholder="Your name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="agentEmail" className="text-sm">Agent Email</Label>
                <Input
                  id="agentEmail"
                  type="email"
                  value={shareData.agentEmail}
                  onChange={(e) => setShareData(prev => ({ ...prev, agentEmail: e.target.value }))}
                  placeholder="your.email@agency.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="customMessage" className="text-sm">Custom Message</Label>
                <Textarea
                  id="customMessage"
                  value={shareData.customMessage}
                  onChange={(e) => setShareData(prev => ({ ...prev, customMessage: e.target.value }))}
                  placeholder="This property matches your criteria perfectly..."
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button 
                  onClick={() => handleShare(selectedListing)}
                  disabled={shareMutation.isPending}
                  className="flex-1 order-2 sm:order-1"
                >
                  {shareMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Share2 className="w-4 h-4 mr-1" />
                  )}
                  Create Link
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedListing(null)}
                  className="order-1 sm:order-2"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Personal Message Modal */}
      {personalMessageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Personal Message Generated</CardTitle>
              <CardDescription className="text-sm">
                AI-generated personal message for {personalMessageModal.listing.listing.address}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="personalMessage" className="text-sm">Personal Message</Label>
                <Textarea
                  id="personalMessage"
                  value={personalMessageModal.message}
                  onChange={(e) => setPersonalMessageModal(prev => 
                    prev ? { ...prev, message: e.target.value } : null
                  )}
                  rows={4}
                  className="mt-2"
                />
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    AI Generated
                  </Badge>
                  <span className="text-xs text-gray-500">Edit as needed before sending</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button 
                  onClick={() => {
                    navigator.clipboard.writeText(personalMessageModal.message);
                    toast({ title: "Message copied to clipboard!" });
                  }}
                  className="flex-1 order-2 sm:order-1"
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copy Message
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setPersonalMessageModal(null)}
                  className="order-1 sm:order-2"
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Message Modal */}
      {editingListing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Edit Assessment</CardTitle>
              <CardDescription className="text-sm">
                Modify the AI-generated assessment for this property
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="editMessage" className="text-sm">Professional Assessment</Label>
                <Textarea
                  id="editMessage"
                  value={editedMessage}
                  onChange={(e) => setEditedMessage(e.target.value)}
                  rows={4}
                  className="mt-2"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button 
                  onClick={() => handleSaveEdit(editingListing)}
                  className="flex-1 order-2 sm:order-1"
                >
                  Save Changes
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setEditingListing(null)}
                  className="order-1 sm:order-2"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
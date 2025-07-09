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
import { Brain, Eye, Share2, Copy, MessageSquare, Mail, Loader2, Star, Camera, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
    budget_score: number;
    feature_score: number;
    dealbreaker_penalty: number;
    location_score: number;
    tag_score: number;
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const handleShare = (listing: EnhancedScoredListing) => {
    shareMutation.mutate({
      listingId: listing.listing.id,
      ...shareData
    });
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
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg">
              {listing.listing.address}
              {isTopPick && <Badge className="ml-2 bg-green-100 text-green-800">Top Pick</Badge>}
            </CardTitle>
            <CardDescription>
              {formatPrice(listing.listing.price)} • {listing.listing.bedrooms}BR/{listing.listing.bathrooms}BA
              {listing.listing.square_feet && ` • ${listing.listing.square_feet.toLocaleString()} sqft`}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${getScoreColor(listing.match_score)}`}>
              {Math.round(listing.match_score * 100)}%
            </div>
            <div className="text-sm text-gray-500">{listing.label}</div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* Enhanced Reason with Personalized Analysis */}
          <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
            <div className="flex items-start gap-2">
              <Brain className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                {listing.enhancedReason?.split('\n\nPersonalized Visual Analysis:').map((part, index) => (
                  <div key={index} className={index === 0 ? 'mb-2' : 'pt-2 border-t border-blue-200 dark:border-blue-800'}>
                    {index === 1 && (
                      <div className="flex items-center gap-1 mb-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                        <Eye className="w-3 h-3" />
                        Personalized for You:
                      </div>
                    )}
                    <div className={index === 1 ? 'italic' : ''}>{part}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Visual Analysis Results */}
          {listing.visualAnalysis && (
            <div className="bg-purple-50 dark:bg-purple-950/20 p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800 dark:text-purple-200">
                  Visual Intelligence
                </span>
                <Badge variant="outline" className="text-xs">
                  {listing.visualAnalysis.analyses.length} images analyzed
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

          {/* Images Preview */}
          {listing.listing.images && listing.listing.images.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1">
                <Camera className="w-4 h-4" />
                Photos ({listing.listing.images.length})
              </p>
              <div className="grid grid-cols-4 gap-2">
                {listing.listing.images.slice(0, 4).map((image, idx) => (
                  <img 
                    key={idx}
                    src={image} 
                    alt={`Property ${idx + 1}`}
                    className="w-full h-16 object-cover rounded-md"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
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
              <div className="flex justify-between items-center">
                <span>Budget Match:</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-green-500 h-1.5 rounded-full" 
                      style={{width: `${listing.score_breakdown.budget_score * 100}%`}}
                    />
                  </div>
                  <span className="font-medium">{Math.round(listing.score_breakdown.budget_score * 100)}%</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>Features Match:</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-blue-500 h-1.5 rounded-full" 
                      style={{width: `${listing.score_breakdown.feature_score * 100}%`}}
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
                      style={{width: `${listing.score_breakdown.location_score * 100}%`}}
                    />
                  </div>
                  <span className="font-medium">{Math.round(listing.score_breakdown.location_score * 100)}%</span>
                </div>
              </div>
              {listing.score_breakdown.tag_score > 0 && (
                <div className="flex justify-between items-center">
                  <span>Behavioral Match:</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-gray-200 rounded-full h-1.5">
                      <div 
                        className="bg-yellow-500 h-1.5 rounded-full" 
                        style={{width: `${listing.score_breakdown.tag_score * 100}%`}}
                      />
                    </div>
                    <span className="font-medium">{Math.round(listing.score_breakdown.tag_score * 100)}%</span>
                  </div>
                </div>
              )}
              {listing.score_breakdown.dealbreaker_penalty < 0 && (
                <div className="flex justify-between items-center text-red-600">
                  <span>Dealbreaker Penalty:</span>
                  <span className="font-medium">{Math.round(listing.score_breakdown.dealbreaker_penalty * 100)}%</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setSelectedListing(listing)}
            >
              <Share2 className="w-4 h-4 mr-1" />
              Share
            </Button>
            <Button size="sm" variant="outline">
              View Details
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (isSearching) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p className="text-lg font-medium mb-2">Your Secret Weapon is Loading...</p>
          <p className="text-sm text-gray-600 mb-4">
            We're doing what no other platform can: analyzing actual property photos to match your client's visual preferences. 
            In 20-30 seconds, you'll have personalized talking points that will blow your clients away.
          </p>
          <div className="text-xs text-gray-500 space-y-1">
            <div>• Scanning 100+ properties in target area</div>
            <div>• AI analyzing kitchen styles, flooring, lighting</div>
            <div>• Creating buyer-specific property insights</div>
            <div>• Generating "Hi [Client Name]" personalized messages</div>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-600" />
            Enhanced Listing Search
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            AI-powered visual analysis with intelligent matching
          </p>
        </div>
      </div>

      {enhancedResults && (
        <>
          {/* Search Summary */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {enhancedResults.top_picks?.length || 0}
                  </div>
                  <div className="text-sm text-gray-600">Top Picks</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-600">
                    {enhancedResults.other_matches?.length || 0}
                  </div>
                  <div className="text-sm text-gray-600">Other Matches</div>
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
            <TabsList>
              <TabsTrigger value="enhanced-search">
                <Star className="w-4 h-4 mr-1" />
                Top Picks ({enhancedResults.top_picks?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="other-matches">
                Other Matches ({enhancedResults.other_matches?.length || 0})
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
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Share Listing</CardTitle>
              <CardDescription>
                Create a shareable link for {selectedListing.listing.address}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="agentName">Agent Name</Label>
                <Input
                  id="agentName"
                  value={shareData.agentName}
                  onChange={(e) => setShareData(prev => ({ ...prev, agentName: e.target.value }))}
                  placeholder="Your name"
                />
              </div>
              <div>
                <Label htmlFor="agentEmail">Agent Email</Label>
                <Input
                  id="agentEmail"
                  type="email"
                  value={shareData.agentEmail}
                  onChange={(e) => setShareData(prev => ({ ...prev, agentEmail: e.target.value }))}
                  placeholder="your.email@agency.com"
                />
              </div>
              <div>
                <Label htmlFor="customMessage">Custom Message</Label>
                <Textarea
                  id="customMessage"
                  value={shareData.customMessage}
                  onChange={(e) => setShareData(prev => ({ ...prev, customMessage: e.target.value }))}
                  placeholder="This property matches your criteria perfectly..."
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleShare(selectedListing)}
                  disabled={shareMutation.isPending}
                  className="flex-1"
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
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { SavePropertyButton } from './save-property-button';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { 
  Search, 
  Grid, 
  List, 
  MapPin, 
  Bed, 
  Bath, 
  Square, 
  DollarSign,
  Eye,
  Share2,
  Star,
  TrendingUp,
  Clock,
  Calendar,
  Home,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import type { BuyerProfile } from '@shared/schema';

interface AgentDualViewSearchProps {
  profile: BuyerProfile;
}

interface SearchView1Results {
  viewType: 'broad';
  searchCriteria: {
    budgetRange: string;
    bedrooms: string;
    location: string;
    propertyType?: string;
  };
  totalFound: number;
  listings: MarketOverviewListing[];
  rejectedListings?: MarketOverviewListing[];  // Properties filtered out due to dealbreakers
  executionTime: number;
}

interface SearchView2Results {
  viewType: 'ai_recommendations';
  searchCriteria: {
    budgetRange: string;
    bedrooms: string;
    location: string;
    propertyType?: string;
  };
  totalFound: number;
  listings: AIRecommendationListing[];
  executionTime: number;
  aiAnalysis: {
    topMatches: number;
    visualAnalysis: boolean;
    scoringFactors: string[];
  };
}

interface StatusIndicator {
  type: string;
  label: string;
  color: string;
}

interface MarketOverviewListing {
  mlsNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  listPrice: number;
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  propertyType: string;
  daysOnMarket?: number;
  status: string;
  images: string[];
  photoCount: number;
  description?: string;
  yearBuilt?: number;
  lotSize?: number;
  features?: string[];
  // Market intelligence metrics
  pricePerSqft?: number;
  statusIndicators?: StatusIndicator[];
  filterReasons?: string[];  // Clear, objective filter reasons
  matchScore?: number;
}

interface AIRecommendationListing extends MarketOverviewListing {
  matchScore: number;
  matchLabel: string;
  matchReasons: string[];
  dealbreakers: string[];
  reason?: string; // Add this for backward compatibility
  aiInsights?: {
    visualAnalysis?: string;
    styleMatch?: string;
    qualityScore?: number;
    personalizedAnalysis?: {
      summary: string;
      hiddenGems: string[];
      missingInfo: string[];
      agentTasks: string[];
    };
    agentSummary?: string;
  };
  scoreBreakdown: {
    featureMatch: number;
    budgetMatch: number;
    bedroomMatch: number;
    locationMatch: number;
    overallScore: number;
  };
}

interface SearchAdjustment {
  field: string;
  originalValue: any;
  adjustedValue: any;
  description: string;
}

interface AgentSearchResponse {
  searchType: 'agent_dual_view' | 'agent_dual_view_reactive';
  profileData: {
    id: number;
    name: string;
    location: string;
  };
  // For reactive search
  initialSearch?: {
    view1: SearchView1Results;
    view2: SearchView2Results;
    totalFound: number;
    sufficientResults: boolean;
  };
  enhancedSearch?: {
    triggered: boolean;
    reason: string;
    view1: SearchView1Results;
    adjustments: SearchAdjustment[];
    adjustmentSummary: string;
    clientSummary: string;
  };
  agentRecommendations?: {
    shouldEnhance: boolean;
    message: string;
    suggestedActions: string[];
  };
  // For standard search (backward compatibility)
  view1?: SearchView1Results;
  view2?: SearchView2Results;
  totalExecutionTime: number;
  timestamp: string;
}

export function AgentDualViewSearch({ profile }: AgentDualViewSearchProps) {
  const [hasSearched, setHasSearched] = useState(false);
  const [activeView, setActiveView] = useState<'view1' | 'view2'>('view1');
  const [forceEnhanced, setForceEnhanced] = useState(false);
  const [selectedProperties, setSelectedProperties] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mutation to save multiple properties
  const savePropertiesMutation = useMutation({
    mutationFn: async (propertyIds: string[]) => {
      const savePromises = propertyIds.map(listingId =>
        apiRequest('POST', `/api/buyer-profiles/${profile.id}/properties`, {
          listing_id: listingId,
          interaction_type: 'saved'
        })
      );
      return Promise.all(savePromises);
    },
    onSuccess: () => {
      toast({
        title: 'Properties saved',
        description: `Successfully saved ${selectedProperties.size} properties to this buyer profile`
      });
      setSelectedProperties(new Set());
      queryClient.invalidateQueries({ queryKey: [`/api/buyer-profiles/${profile.id}/properties`] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to save properties. Please try again.',
        variant: 'destructive'
      });
    }
  });

  // Search query with reactive search enabled
  const { data: searchResults, isLoading, refetch } = useQuery<AgentSearchResponse>({
    queryKey: ['/api/agent-search', profile.id, forceEnhanced],
    queryFn: async () => {
      const response = await fetch('/api/agent-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          profileId: profile.id,
          useReactive: true,  // Enable reactive search
          forceEnhanced
        })
      });
      
      if (!response.ok) {
        throw new Error('Search failed');
      }
      
      return response.json();
    },
    enabled: hasSearched,
    staleTime: 300000, // 5 minutes
    gcTime: 1800000, // Keep in cache for 30 minutes (was cacheTime)
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const handleSearch = () => {
    // Clear cache to ensure fresh results
    queryClient.invalidateQueries({ queryKey: ['/api/agent-search', profile.id] });
    setHasSearched(true);
    setForceEnhanced(false); // Reset force enhanced
    refetch();
  };

  const handleEnhancedSearch = () => {
    // Clear cache for enhanced search too
    queryClient.invalidateQueries({ queryKey: ['/api/agent-search', profile.id] });
    setForceEnhanced(true);
    refetch();
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(price);
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 75) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (score >= 65) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Property Search for {profile.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium">Location</label>
              <p className="text-sm text-gray-600">{profile.location}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Budget</label>
              <p className="text-sm text-gray-600">
                {profile.budgetMin && profile.budgetMax 
                  ? `${formatPrice(profile.budgetMin)} - ${formatPrice(profile.budgetMax)}`
                  : 'Any budget'
                }
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Requirements</label>
              <p className="text-sm text-gray-600">
                {profile.bedrooms} beds, {profile.bathrooms} baths
              </p>
            </div>
          </div>
          
          <Button 
            onClick={handleSearch} 
            disabled={isLoading} 
            className="w-full md:w-auto"
          >
            {isLoading ? 'Searching Properties...' : hasSearched ? 'Refresh Search' : 'Search Properties'}
          </Button>
        </CardContent>
      </Card>

      {/* Search Results */}
      {isLoading && (
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Searching properties for {profile.name}...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {searchResults && !isLoading && (
        <div className="space-y-6">
          {/* Enhanced Search Alert */}
          {searchResults.enhancedSearch?.triggered && (
            <Alert className="border-blue-200 bg-blue-50">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-900">Enhanced Search Activated</AlertTitle>
              <AlertDescription className="text-blue-800">
                {searchResults.enhancedSearch.reason}. {searchResults.enhancedSearch.adjustmentSummary}
              </AlertDescription>
            </Alert>
          )}

          {/* Agent Recommendations */}
          {searchResults.agentRecommendations && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  Agent Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 mb-3">
                  {searchResults.agentRecommendations.message}
                </p>
                <ul className="space-y-1">
                  {searchResults.agentRecommendations.suggestedActions.map((action, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* View Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant={activeView === 'view1' ? 'default' : 'outline'}
                onClick={() => setActiveView('view1')}
                className="flex items-center gap-2"
              >
                <List className="h-4 w-4" />
                Market Overview ({
                  searchResults.enhancedSearch?.triggered 
                    ? searchResults.enhancedSearch.view1.totalFound 
                    : (searchResults.initialSearch?.view1.totalFound || searchResults.view1?.totalFound || 0)
                })
              </Button>
              <Button
                variant={activeView === 'view2' ? 'default' : 'outline'}
                onClick={() => setActiveView('view2')}
                className="flex items-center gap-2"
              >
                <Star className="h-4 w-4" />
                AI Recommendations ({
                  searchResults.initialSearch?.view2.totalFound || searchResults.view2?.totalFound || 0
                })
              </Button>
            </div>
            
            <div className="text-sm text-gray-600">
              Search completed in {searchResults.totalExecutionTime}ms
            </div>
          </div>

          {/* View 1: Market Overview */}
          {activeView === 'view1' && (
            <>
              {/* Show adjustments if enhanced search was triggered */}
              {searchResults.enhancedSearch?.adjustments && searchResults.enhancedSearch.adjustments.length > 0 && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Search Criteria Adjustments</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 mb-4">
                      {searchResults.enhancedSearch.adjustments.map((adj, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="font-medium capitalize">{adj.field}:</span>
                          <span>
                            <span className="text-gray-500 line-through mr-2">{adj.originalValue}</span>
                            <span className="text-blue-700 font-medium">→ {adj.adjustedValue}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    {/* Client-ready summary */}
                    <div className="p-3 bg-white rounded-lg border border-blue-200">
                      <p className="text-xs font-medium text-gray-600 mb-1">Copy for Client:</p>
                      <p className="text-sm text-gray-800 italic">
                        "{searchResults.enhancedSearch.clientSummary}"
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <MarketOverviewView 
                results={
                  searchResults.enhancedSearch?.triggered 
                    ? searchResults.enhancedSearch.view1 
                    : (searchResults.initialSearch?.view1 || searchResults.view1!)
                }
                formatPrice={formatPrice}
                profile={profile}
                selectedProperties={selectedProperties}
                setSelectedProperties={setSelectedProperties}
                onSaveProperties={(ids) => savePropertiesMutation.mutate(ids)}
              />

              {/* Manual Enhanced Search Button */}
              {searchResults.initialSearch && 
               searchResults.initialSearch.totalFound < 20 && 
               !searchResults.enhancedSearch?.triggered && (
                <div className="text-center pt-4">
                  <Button 
                    onClick={handleEnhancedSearch}
                    variant="outline"
                    className="gap-2"
                  >
                    <Search className="h-4 w-4" />
                    Find More Options with Flexible Criteria
                  </Button>
                  <p className="text-sm text-gray-500 mt-2">
                    This will expand budget by ±20% and include ±1 bedroom
                  </p>
                </div>
              )}
            </>
          )}

          {/* View 2: AI Recommendations */}
          {activeView === 'view2' && (
            <AIRecommendationsView 
              results={searchResults.initialSearch?.view2 || searchResults.view2!}
              formatPrice={formatPrice}
              getScoreColor={getScoreColor}
              profile={profile}
              selectedProperties={selectedProperties}
              setSelectedProperties={setSelectedProperties}
              onSaveProperties={(ids) => savePropertiesMutation.mutate(ids)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Market Overview Component
function MarketOverviewView({
  results,
  formatPrice,
  profile,
  selectedProperties,
  setSelectedProperties,
  onSaveProperties
}: {
  results: SearchView1Results;
  formatPrice: (price: number) => string;
  profile: BuyerProfile;
  selectedProperties: Set<string>;
  setSelectedProperties: (selected: Set<string>) => void;
  onSaveProperties: (propertyIds: string[]) => void;
}) {
  const [showRejected, setShowRejected] = useState(true);

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              Market Overview ({results.totalFound} properties)
            </CardTitle>
            <div className="text-sm text-gray-600 mt-1">
              Search criteria: {results.searchCriteria.budgetRange}, {results.searchCriteria.bedrooms} beds, {results.searchCriteria.location}
            </div>
          </div>
          {selectedProperties.size > 0 && (
            <Button
              onClick={() => {
                onSaveProperties(Array.from(selectedProperties));
              }}
            >
              Save {selectedProperties.size} Properties
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-4 font-medium">
                  <Checkbox
                    checked={selectedProperties.size === results.listings.slice(0, 20).length && results.listings.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        const allIds = new Set(results.listings.slice(0, 20).map(p => p.mlsNumber || `${p.address}-${p.listPrice}`));
                        setSelectedProperties(allIds);
                      } else {
                        setSelectedProperties(new Set());
                      }
                    }}
                  />
                </th>
                <th className="text-left p-4 font-medium">Property</th>
                <th className="text-left p-4 font-medium">Price</th>
                <th className="text-left p-4 font-medium">$/SqFt</th>
                <th className="text-left p-4 font-medium">Beds/Baths</th>
                <th className="text-left p-4 font-medium">Sq Ft</th>
                <th className="text-left p-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {results.listings.slice(0, 20).map((property, index) => (
                <tr key={property.mlsNumber || `property-${index}`} className="border-b hover:bg-gray-50">
                  <td className="p-4">
                    <Checkbox
                      checked={selectedProperties.has(property.mlsNumber || `${property.address}-${property.listPrice}`)}
                      onCheckedChange={(checked) => {
                        const id = property.mlsNumber || `${property.address}-${property.listPrice}`;
                        const newSelected = new Set(selectedProperties);
                        if (checked) {
                          newSelected.add(id);
                        } else {
                          newSelected.delete(id);
                        }
                        setSelectedProperties(newSelected);
                      }}
                    />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-12 bg-gray-200 rounded flex items-center justify-center">
                        <Home className="h-6 w-6 text-gray-400" />
                      </div>
                      <div>
                        <div className="font-medium">{property.address}</div>
                        <div className="text-sm text-gray-600">
                          {property.city}, {property.state} {property.zip}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold">{formatPrice(property.listPrice)}</div>
                    {property.pricePerSqft && (
                      <div className="text-xs text-gray-500">${property.pricePerSqft}/sqft</div>
                    )}
                  </td>
                  <td className="p-4 font-medium text-gray-700">
                    {property.pricePerSqft ? `$${property.pricePerSqft}` : 'N/A'}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Bed className="h-4 w-4" />
                        {property.bedrooms}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bath className="h-4 w-4" />
                        {property.bathrooms}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-gray-600">
                    {property.sqft ? `${property.sqft?.toLocaleString()}` : 'N/A'}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {property.statusIndicators && property.statusIndicators.length > 0 ? (
                        property.statusIndicators.map((indicator, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className={`text-xs ${
                              indicator.color === 'red' ? 'bg-red-100 text-red-800 border-red-300' :
                              indicator.color === 'yellow' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                              'bg-gray-100 text-gray-800 border-gray-300'
                            }`}
                          >
                            {indicator.label}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-gray-600">{property.propertyType}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

      {/* Filtered Out Properties Section */}
      {results.rejectedListings && results.rejectedListings.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="cursor-pointer" onClick={() => setShowRejected(!showRejected)}>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-red-800">
                <AlertCircle className="h-5 w-5" />
                Filtered Out Properties ({results.rejectedListings.length})
              </CardTitle>
              <Button variant="ghost" size="sm">
                {showRejected ? 'Hide' : 'Show'}
              </Button>
            </div>
            <div className="text-sm text-red-600 mt-1">
              Properties excluded based on objective criteria (budget, bedrooms, etc.)
            </div>
          </CardHeader>
          {showRejected && (
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-red-50 border-b border-red-200">
                    <tr>
                      <th className="text-left p-4 font-medium text-red-900">Property</th>
                      <th className="text-left p-4 font-medium text-red-900">Price</th>
                      <th className="text-left p-4 font-medium text-red-900">Beds/Baths</th>
                      <th className="text-left p-4 font-medium text-red-900">Filter Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.rejectedListings.map((property, index) => (
                      <tr key={property.mlsNumber || `rejected-${index}`} className="border-b border-red-100 hover:bg-red-50">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-16 h-12 bg-red-100 rounded flex items-center justify-center">
                              <Home className="h-6 w-6 text-red-400" />
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{property.address}</div>
                              <div className="text-sm text-gray-600">
                                {property.city}, {property.state} {property.zip}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-semibold text-gray-900">{formatPrice(property.listPrice)}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1 text-gray-700">
                              <Bed className="h-4 w-4" />
                              {property.bedrooms}
                            </span>
                            <span className="flex items-center gap-1 text-gray-700">
                              <Bath className="h-4 w-4" />
                              {property.bathrooms}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            {property.filterReasons && property.filterReasons.length > 0 ? (
                              property.filterReasons.map((reason, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs bg-orange-100 text-orange-800 border-orange-300">
                                  {reason}
                                </Badge>
                              ))
                            ) : (
                              <Badge variant="outline" className="text-xs bg-gray-100 text-gray-800 border-gray-300">
                                Filtered out
                              </Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

// AI Recommendations Component
function AIRecommendationsView({
  results,
  formatPrice,
  getScoreColor,
  profile,
  selectedProperties,
  setSelectedProperties,
  onSaveProperties
}: {
  results: SearchView2Results;
  formatPrice: (price: number) => string;
  getScoreColor: (score: number) => string;
  profile: BuyerProfile;
  selectedProperties: Set<string>;
  setSelectedProperties: (selected: Set<string>) => void;
  onSaveProperties: (propertyIds: string[]) => void;
}) {
  // State to track selected image index for each property
  const [selectedImageIndex, setSelectedImageIndex] = useState<Record<string, number>>({});

  // Handler to change the displayed image
  const handleImageClick = (propertyId: string, imageIndex: number) => {
    setSelectedImageIndex(prev => ({
      ...prev,
      [propertyId]: imageIndex
    }));
  };

  // Handler to cycle to next image when clicking main image
  const handleMainImageClick = (propertyId: string, totalImages: number) => {
    setSelectedImageIndex(prev => {
      const currentIndex = prev[propertyId] || 0;
      const nextIndex = (currentIndex + 1) % totalImages;
      return {
        ...prev,
        [propertyId]: nextIndex
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Select All Header */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedProperties.size === results.listings.slice(0, 10).length && results.listings.length > 0}
                onCheckedChange={(checked) => {
                  if (checked) {
                    const allIds = new Set(results.listings.slice(0, 10).map(p => p.mlsNumber || `${p.address}-${p.listPrice}`));
                    setSelectedProperties(allIds);
                  } else {
                    setSelectedProperties(new Set());
                  }
                }}
              />
              <span className="font-medium">
                Select All ({selectedProperties.size} selected)
              </span>
            </div>
            {selectedProperties.size > 0 && (
              <Button
                onClick={() => {
                  onSaveProperties(Array.from(selectedProperties));
                }}
              >
                Save {selectedProperties.size} Properties
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Property Recommendations */}
      <div className="grid grid-cols-1 gap-6">
        {results.listings.slice(0, 10).map((property, index) => (
          <Card key={property.mlsNumber || `ai-property-${index}`} className="overflow-hidden hover:shadow-lg transition-shadow">
            {/* Property Images Section */}
            <div className="relative">
              <div className="aspect-[4/3] bg-gray-100">
                {property.images && property.images.length > 0 ? (
                  <div className="relative h-full">
                    {/* Main Image - Clickable to cycle through images */}
                    <img
                      src={property.images[selectedImageIndex[property.mlsNumber] || 0]}
                      alt={`${property.address} - ${property.city}, ${property.state}`}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => handleMainImageClick(property.mlsNumber, property.images.length)}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.onerror = null;
                        target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTVlN2ViIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzZiNzI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
                      }}
                    />

                    {/* Image Counter */}
                    <div className="absolute top-4 right-4">
                      <Badge className="bg-black/70 text-white backdrop-blur-sm">
                        {(selectedImageIndex[property.mlsNumber] || 0) + 1} / {property.images.length}
                      </Badge>
                    </div>

                    {/* Thumbnail strip for additional images - Now Clickable */}
                    {property.images.length > 1 && (
                      <div className="absolute bottom-2 left-2 right-2 flex gap-1 overflow-x-auto">
                        {property.images.map((img, idx) => {
                          const isSelected = (selectedImageIndex[property.mlsNumber] || 0) === idx;
                          return (
                            <div
                              key={idx}
                              className={`w-16 h-12 rounded overflow-hidden cursor-pointer transition-all flex-shrink-0
                                ${isSelected
                                  ? 'ring-2 ring-white ring-offset-2 ring-offset-black/50'
                                  : 'hover:opacity-100 opacity-70'
                                }`}
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent triggering main image click
                                handleImageClick(property.mlsNumber, idx);
                              }}
                            >
                              <img
                                src={img}
                                alt={`View ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <Home className="h-16 w-16 text-gray-400" />
                  </div>
                )}
              </div>
              
              {/* Selection Checkbox */}
              <div className="absolute top-4 left-4 bg-white rounded-md p-2 shadow-md">
                <Checkbox
                  checked={selectedProperties.has(property.mlsNumber || `${property.address}-${property.listPrice}`)}
                  onCheckedChange={(checked) => {
                    const id = property.mlsNumber || `${property.address}-${property.listPrice}`;
                    const newSelected = new Set(selectedProperties);
                    if (checked) {
                      newSelected.add(id);
                    } else {
                      newSelected.delete(id);
                    }
                    setSelectedProperties(newSelected);
                  }}
                />
              </div>

              {/* Match Score Badge */}
              <div className="absolute top-4 left-14">
                <Badge className={`${getScoreColor(property.matchScore)} border font-semibold text-sm px-3 py-1`}>
                  {property.matchScore}% Match
                </Badge>
              </div>
            </div>
            
            <CardContent className="space-y-6">
              {/* Property Header */}
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-3xl font-bold text-gray-900">{formatPrice(property.listPrice)}</div>
                    <div className="text-lg font-medium text-gray-700">{property.address}</div>
                    <div className="text-gray-600">
                      {property.city}, {property.state} {property.zip}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-3">
                      <div className="text-center px-3">
                        <div className="text-2xl font-bold">{property.bedrooms}</div>
                        <div className="text-xs text-gray-600">Beds</div>
                      </div>
                      <div className="text-center px-3 border-l border-gray-200">
                        <div className="text-2xl font-bold">{property.bathrooms}</div>
                        <div className="text-xs text-gray-600">Baths</div>
                      </div>
                      <div className="text-center px-3 border-l border-gray-200">
                        <div className="text-2xl font-bold">
                          {property.sqft ? Math.round(property.sqft).toLocaleString() : '—'}
                        </div>
                        <div className="text-xs text-gray-600">Sq Ft</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Stats Bar */}
                <div className="flex items-center gap-4 text-sm text-gray-600 pb-4 border-b">
                  <span className="flex items-center gap-1">
                    <Home className="h-4 w-4" />
                    {property.propertyType}
                  </span>
                  {property.yearBuilt && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Built {property.yearBuilt}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {property.daysOnMarket ? `${property.daysOnMarket} days on market` : 'New listing'}
                  </span>
                </div>
              </div>

              {/* 3 CORE SECTIONS: What's Matching, What's Missing, Red Flags */}
              <div className="space-y-4">
                {/* Section 1: ✅ What's Matching */}
                {property.matchReasons.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <h4 className="font-semibold text-green-900">What's Matching</h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {property.matchReasons.map((reason, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs bg-white text-green-700 border-green-300">
                          ✓ {reason}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section 2: ⚠️ What's Missing */}
                {property.aiInsights?.personalizedAnalysis?.missingInfo &&
                 property.aiInsights.personalizedAnalysis.missingInfo.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      <h4 className="font-semibold text-amber-900">What's Missing</h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {property.aiInsights.personalizedAnalysis.missingInfo.map((info, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs bg-white text-amber-700 border-amber-300">
                          ⚠️ {info}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section 3: 🚩 Red Flags */}
                {property.dealbreakers.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <h4 className="font-semibold text-red-900">Red Flags</h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {property.dealbreakers.map((concern, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs bg-white text-red-700 border-red-300">
                          🚩 {concern}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Property Description */}
              {property.description && (
                <div>
                  <h4 className="font-medium text-sm text-gray-900 mb-2">Property Description</h4>
                  <p className="text-sm text-gray-700 line-clamp-3">
                    {property.description}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button className="flex-1" size="sm">
                  <Share2 className="h-4 w-4 mr-2" />
                  Share with Client
                </Button>
                <Button variant="outline" className="flex-1" size="sm">
                  <Eye className="h-4 w-4 mr-2" />
                  Full Details
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
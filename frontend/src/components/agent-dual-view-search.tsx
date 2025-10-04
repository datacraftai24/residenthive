import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    setHasSearched(true);
    setForceEnhanced(false); // Reset force enhanced
    refetch();
  };

  const handleEnhancedSearch = () => {
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
  formatPrice 
}: { 
  results: SearchView1Results; 
  formatPrice: (price: number) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <List className="h-5 w-5" />
          Market Overview ({results.totalFound} properties)
        </CardTitle>
        <div className="text-sm text-gray-600">
          Search criteria: {results.searchCriteria.budgetRange}, {results.searchCriteria.bedrooms} beds, {results.searchCriteria.location}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-4 font-medium">Property</th>
                <th className="text-left p-4 font-medium">Price</th>
                <th className="text-left p-4 font-medium">Beds/Baths</th>
                <th className="text-left p-4 font-medium">Sq Ft</th>
                <th className="text-left p-4 font-medium">Type</th>
                <th className="text-left p-4 font-medium">Days on Market</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.listings.slice(0, 20).map((property, index) => (
                <tr key={property.mlsNumber || `property-${index}`} className="border-b hover:bg-gray-50">
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
                  <td className="p-4 font-semibold">{formatPrice(property.listPrice)}</td>
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
                  <td className="p-4">
                    <span className="flex items-center gap-1">
                      <Square className="h-4 w-4" />
                      {property.sqft ? `${property.sqft?.toLocaleString()} sq ft` : 'N/A'}
                    </span>
                  </td>
                  <td className="p-4">
                    <Badge variant="secondary">{property.propertyType}</Badge>
                  </td>
                  <td className="p-4">
                    {property.daysOnMarket ? `${property.daysOnMarket} days` : 'New'}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline">
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// AI Recommendations Component
function AIRecommendationsView({ 
  results, 
  formatPrice, 
  getScoreColor 
}: { 
  results: SearchView2Results; 
  formatPrice: (price: number) => string;
  getScoreColor: (score: number) => string;
}) {
  return (
    <div className="space-y-6">
      {/* 10-Second Overview for Agent */}
      <Card className="border-2 border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-600" />
              <span className="text-lg">10-Second Agent Overview</span>
            </div>
            <Badge variant="outline" className="bg-white">
              {results.listings.length} Properties Analyzed
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Quick Status Overview */}
          <div className="flex items-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium">
                {results.listings.filter(p => p.matchScore >= 80).length} Strong Matches
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-sm font-medium">
                {results.listings.filter(p => p.matchScore >= 60 && p.matchScore < 80).length} Good Options
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              <span className="text-sm font-medium">
                {results.listings.filter(p => p.aiInsights?.personalizedAnalysis?.hiddenGems && p.aiInsights.personalizedAnalysis.hiddenGems.length > 0).length} Hidden Gems
              </span>
            </div>
          </div>

          {/* Visual Property Grid */}
          <div className="grid grid-cols-10 gap-1">
            {results.listings.slice(0, 30).map((property, idx) => (
              <div
                key={property.mlsNumber}
                className={`relative w-8 h-8 rounded flex items-center justify-center text-xs font-semibold cursor-pointer group
                  ${property.matchScore >= 80 ? 'bg-green-500 text-white' : 
                    property.matchScore >= 60 ? 'bg-yellow-500 text-white' : 
                    'bg-gray-400 text-white'}
                  ${property.aiInsights?.personalizedAnalysis?.hiddenGems && property.aiInsights.personalizedAnalysis.hiddenGems.length > 0 ? 'ring-2 ring-purple-600 ring-offset-1' : ''}
                `}
                title={`${property.address} - ${property.matchScore}% match`}
              >
                {idx + 1}
                {property.matchScore >= 85 && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-600 rounded-full"></div>
                )}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-3 text-xs text-gray-600 flex items-center gap-4">
            <span>Click number to jump to property</span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-purple-600 rounded-full"></div> AI Recommended
            </span>
            <span className="flex items-center gap-1">
              <div className="w-4 h-4 border-2 border-purple-600 rounded"></div> Hidden Gem
            </span>
          </div>
        </CardContent>
      </Card>

      {/* AI Analysis Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            AI Analysis Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold">{results.aiAnalysis.topMatches}</div>
              <div className="text-sm text-gray-600">Top Matches Found</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{results.aiAnalysis.visualAnalysis ? 'Yes' : 'No'}</div>
              <div className="text-sm text-gray-600">Visual Analysis Applied</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{results.executionTime}ms</div>
              <div className="text-sm text-gray-600">Analysis Time</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Scoring Factors:</div>
            <div className="flex flex-wrap gap-2">
              {results.aiAnalysis.scoringFactors.map((factor) => (
                <Badge key={factor} variant="outline">{factor}</Badge>
              ))}
            </div>
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
                    <img
                      src={property.images[0]}
                      alt={`${property.address} - ${property.city}, ${property.state}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.onerror = null;
                        target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTVlN2ViIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzZiNzI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
                      }}
                    />
                    {/* Thumbnail strip for additional images */}
                    {property.images.length > 1 && (
                      <div className="absolute bottom-2 left-2 right-2 flex gap-1">
                        {property.images.slice(1, 4).map((img, idx) => (
                          <div key={idx} className="w-16 h-12 bg-black/50 backdrop-blur-sm rounded overflow-hidden">
                            <img src={img} alt="" className="w-full h-full object-cover opacity-80" />
                          </div>
                        ))}
                        {property.images.length > 4 && (
                          <div className="w-16 h-12 bg-black/50 backdrop-blur-sm rounded flex items-center justify-center text-white text-sm">
                            +{property.images.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <Home className="h-16 w-16 text-gray-400" />
                  </div>
                )}
              </div>
              
              {/* Match Score Badge */}
              <div className="absolute top-4 left-4">
                <Badge className={`${getScoreColor(property.matchScore)} border font-semibold text-sm px-3 py-1`}>
                  {property.matchScore}% Match
                </Badge>
              </div>
              
              {/* Photo Count Badge */}
              <div className="absolute top-4 right-4">
                <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm">
                  📷 {property.photoCount} photos
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

              {/* Agent's Professional Analysis */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-white" />
                  </div>
                  <h4 className="font-semibold text-gray-900">Agent's AI-Powered Analysis</h4>
                </div>
                
                {/* AI Generated Personalized Analysis */}
                {property.aiInsights?.personalizedAnalysis && (
                  <div className="space-y-3 mb-4">
                    {/* Personal Summary */}
                    <div className="p-3 bg-white rounded-lg">
                      <p className="text-sm text-gray-800 font-medium mb-1">Why I Selected This Property:</p>
                      <p className="text-sm text-gray-700">
                        {property.aiInsights.personalizedAnalysis.summary}
                      </p>
                    </div>
                    
                    {/* Hidden Gems */}
                    {property.aiInsights.personalizedAnalysis.hiddenGems.length > 0 && (
                      <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                        <p className="text-sm font-medium text-green-900 mb-2">💎 Hidden Gems Found:</p>
                        <ul className="text-sm text-green-800 space-y-1">
                          {property.aiInsights.personalizedAnalysis.hiddenGems.map((gem, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-green-600 mt-0.5">•</span>
                              <span>{gem}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Missing Information */}
                    {property.aiInsights.personalizedAnalysis.missingInfo.length > 0 && (
                      <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                        <p className="text-sm font-medium text-amber-900 mb-2">ℹ️ Information Needed:</p>
                        <ul className="text-sm text-amber-800 space-y-1">
                          {property.aiInsights.personalizedAnalysis.missingInfo.slice(0, 3).map((info, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-amber-600 mt-0.5">•</span>
                              <span>{info}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Agent Research Tasks */}
                    {property.aiInsights.personalizedAnalysis.agentTasks.length > 0 && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-sm font-medium text-blue-900 mb-2">📋 Agent To-Do:</p>
                        <ul className="text-sm text-blue-800 space-y-1">
                          {property.aiInsights.personalizedAnalysis.agentTasks.map((task, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <input type="checkbox" className="mt-1" />
                              <span>{task}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Fallback to old display if no personalized analysis */}
                {!property.aiInsights?.personalizedAnalysis && (property.aiInsights?.agentSummary || property.aiInsights?.visualAnalysis) && (
                  <div className="mb-4 p-3 bg-white rounded-lg">
                    <p className="text-sm text-gray-800 whitespace-pre-line">
                      {property.aiInsights.agentSummary || property.aiInsights.visualAnalysis || property.reason}
                    </p>
                  </div>
                )}
                
                {/* 10-Second Agent Summary */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  {/* Quick Match Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {property.matchScore >= 80 ? (
                        <div className="flex items-center gap-1 text-green-700 font-semibold">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          STRONG MATCH
                        </div>
                      ) : property.matchScore >= 60 ? (
                        <div className="flex items-center gap-1 text-yellow-700 font-semibold">
                          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                          GOOD MATCH
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-gray-600 font-semibold">
                          <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                          CONSIDER
                        </div>
                      )}
                      <span className="text-sm text-gray-600">({property.matchScore}%)</span>
                    </div>
                    {property.matchScore >= 85 && (
                      <Badge className="bg-purple-100 text-purple-800">AI RECOMMENDED</Badge>
                    )}
                  </div>

                  {/* Key Highlights in One Line */}
                  <div className="text-sm space-y-1">
                    <div className="flex items-center gap-4 flex-wrap">
                      {/* What Works */}
                      {property.matchReasons.length > 0 && (
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-green-800">{property.matchReasons.slice(0, 2).join(', ')}</span>
                        </div>
                      )}
                      
                      {/* Hidden Gems */}
                      {property.aiInsights?.personalizedAnalysis?.hiddenGems && property.aiInsights.personalizedAnalysis.hiddenGems.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-yellow-600" />
                          <span className="text-yellow-800">
                            {property.aiInsights.personalizedAnalysis.hiddenGems.length} hidden gem{property.aiInsights.personalizedAnalysis.hiddenGems.length > 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                      
                      {/* Concerns */}
                      {property.dealbreakers.length > 0 && (
                        <div className="flex items-center gap-1">
                          <AlertCircle className="h-4 w-4 text-red-600" />
                          <span className="text-red-800">{property.dealbreakers[0]}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Tags */}
                    <div className="flex gap-2 mt-2">
                      {property.matchScore >= 80 && (
                        <Badge variant="default" className="bg-green-600">SHOW FIRST</Badge>
                      )}
                      {property.aiInsights?.personalizedAnalysis?.hiddenGems && property.aiInsights.personalizedAnalysis.hiddenGems.length > 0 && (
                        <Badge variant="default" className="bg-purple-600">HIDDEN GEM</Badge>
                      )}
                      {property.aiInsights?.personalizedAnalysis?.agentTasks && property.aiInsights.personalizedAnalysis.agentTasks.length > 0 && (
                        <Badge variant="default" className="bg-orange-600">NEEDS RESEARCH</Badge>
                      )}
                      {property.matchScore < 60 && property.dealbreakers.length === 0 && (
                        <Badge variant="default" className="bg-gray-600">BACKUP OPTION</Badge>
                      )}
                      {property.dealbreakers.length > 2 && (
                        <Badge variant="default" className="bg-red-600">SKIP</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Due Diligence Badges */}
                <div className="mt-4 pt-3 border-t border-blue-100">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-xs bg-white">
                      🤖 AI Scoring: {property.matchScore}%
                    </Badge>
                    <Badge variant="outline" className="text-xs bg-white">
                      ✓ {property.photoCount} Photos Analyzed
                    </Badge>
                    {property.aiInsights?.visualAnalysis && (
                      <Badge variant="outline" className="text-xs bg-white">
                        👁️ Visual AI Active
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs bg-white">
                      🎯 {property.matchReasons.length} Matches Found
                    </Badge>
                    {property.dealbreakers.length > 0 && (
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                        ⚠️ {property.dealbreakers.length} Concerns
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Match Score Breakdown */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-gray-900">Match Score Breakdown</h4>
                <div className="space-y-2">
                  {Object.entries(property.scoreBreakdown).slice(0, 4).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-600 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, value * 5)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-10 text-right">{value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key Features & Concerns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Matched Features */}
                <div>
                  <h4 className="font-medium text-sm text-gray-900 mb-2">Matched Requirements</h4>
                  <div className="flex flex-wrap gap-1">
                    {property.matchReasons.length > 0 ? (
                      property.matchReasons.map((reason, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          ✓ {reason}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500">Analyzing matches...</span>
                    )}
                  </div>
                </div>

                {/* Potential Concerns */}
                {property.dealbreakers.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm text-gray-900 mb-2">Points to Consider</h4>
                    <div className="flex flex-wrap gap-1">
                      {property.dealbreakers.map((concern, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                          ⚠ {concern}
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
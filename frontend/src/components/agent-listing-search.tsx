import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Star, AlertCircle, Loader2, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Bed, Bath, Maximize, MapPin, Home } from 'lucide-react';

// AI Recommendations listing (top 20 with agent analysis)
interface AIRecommendation {
  listing: {
    id: string;
    price: number;
    bedrooms: number;
    bathrooms: number;
    address: string;
    city: string;
    state: string;
    square_feet?: number;
    description?: string;
  };
  score: number;
  recommendation: string; // SHOW FIRST, SOLID OPTION, MAYBE, SKIP
  one_line_summary: string;
  agent_briefing: string;
  why_this_recommendation: string;
  professional_assessment: {
    what_i_verified: string[];
    honest_concerns: string[];
    hidden_opportunities: string[];
  };
  next_steps: string;
}

// Market Overview listing (all scored properties with dealbreaker info)
interface MarketListing {
  listing: {
    id: string;
    price: number;
    bedrooms: number;
    bathrooms: number;
    address: string;
    city: string;
    state: string;
    square_feet?: number;
  };
  score: number;
  matched_features: string[];
  is_dealbreaker: boolean;
  dealbreaker_reasons: Array<{
    type: string;
    evidence: string;
  }>;
}

interface SearchResults {
  market_overview: MarketListing[];
  ai_recommendations: AIRecommendation[];
  search_summary: {
    total_found: number;
    total_scored: number;
    rejected_count: number;
    ai_recommendations_count: number;
  };
}

interface AgentListingSearchProps {
  profileId: number;
}

export default function AgentListingSearch({ profileId }: AgentListingSearchProps) {
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [activeTab, setActiveTab] = useState<'ai' | 'market'>('ai');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [filterRec, setFilterRec] = useState<string | null>(null);
  const [marketFilter, setMarketFilter] = useState<'all' | 'clean' | 'dealbreakers'>('all');

  const searchMutation = useMutation({
    mutationFn: async (): Promise<SearchResults> => {
      const response = await fetch('/api/listings/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      });

      if (!response.ok) throw new Error(`Search failed`);
      return await response.json();
    },
    onSuccess: (data: SearchResults) => {
      setSearchResults(data);
    }
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(price);
  };

  const getRecommendationBadge = (rec: string) => {
    const badges = {
      'SHOW FIRST': 'bg-green-600 text-white',
      'SOLID OPTION': 'bg-blue-600 text-white',
      'MAYBE': 'bg-yellow-600 text-white',
      'SKIP': 'bg-gray-600 text-white'
    };
    return badges[rec as keyof typeof badges] || 'bg-gray-600 text-white';
  };

  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const filteredRecommendations = filterRec
    ? searchResults?.ai_recommendations.filter(rec => rec.recommendation === filterRec) || []
    : searchResults?.ai_recommendations || [];

  const filteredMarket = searchResults?.market_overview.filter(prop => {
    if (marketFilter === 'clean') return !prop.is_dealbreaker;
    if (marketFilter === 'dealbreakers') return prop.is_dealbreaker;
    return true;
  }) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Agent Property Analysis</h2>
          <p className="text-gray-600">Evidence-based property recommendations</p>
        </div>
        <Button
          onClick={() => searchMutation.mutate()}
          disabled={searchMutation.isPending}
          className="flex items-center gap-2"
        >
          {searchMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Search Properties
        </Button>
      </div>

      {/* Error State */}
      {searchMutation.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <span>Search failed. Please try again.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {searchResults && (
        <>
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Search Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {searchResults.search_summary.total_found}
                  </div>
                  <div className="text-sm text-gray-600">Total Found</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {searchResults.search_summary.total_scored}
                  </div>
                  <div className="text-sm text-gray-600">Scored</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">
                    {searchResults.search_summary.rejected_count}
                  </div>
                  <div className="text-sm text-gray-600">Dealbreakers</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">
                    {searchResults.search_summary.ai_recommendations_count}
                  </div>
                  <div className="text-sm text-gray-600">AI Analyzed</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ai">
                <Star className="h-4 w-4 mr-2" />
                AI Recommendations ({searchResults.ai_recommendations.length})
              </TabsTrigger>
              <TabsTrigger value="market">
                <Search className="h-4 w-4 mr-2" />
                Market Overview ({searchResults.market_overview.length})
              </TabsTrigger>
            </TabsList>

            {/* AI Recommendations Tab */}
            <TabsContent value="ai" className="space-y-4">
              {/* Filter Chips */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant={filterRec === null ? 'default' : 'outline'}
                  onClick={() => setFilterRec(null)}
                >
                  All ({searchResults.ai_recommendations.length})
                </Button>
                {['SHOW FIRST', 'SOLID OPTION', 'MAYBE', 'SKIP'].map((rec) => {
                  const count = searchResults.ai_recommendations.filter(r => r.recommendation === rec).length;
                  if (count === 0) return null;
                  return (
                    <Button
                      key={rec}
                      size="sm"
                      variant={filterRec === rec ? 'default' : 'outline'}
                      onClick={() => setFilterRec(rec)}
                      className={filterRec === rec ? getRecommendationBadge(rec) : ''}
                    >
                      {rec} ({count})
                    </Button>
                  );
                })}
              </div>

              {/* Compact Property Cards */}
              {filteredRecommendations.map((rec) => {
                const isExpanded = expandedCards.has(rec.listing.id);
                return (
                  <Card key={rec.listing.id} className="overflow-hidden">
                    {/* Horizontal Layout: Photo + Info */}
                    <div className="flex flex-col md:flex-row">
                      {/* Photo Section (40%) */}
                      <div className="md:w-2/5 bg-gray-200 relative min-h-[200px] md:min-h-[250px]">
                        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                          <Home className="h-16 w-16" />
                        </div>
                        {/* Badge Overlay */}
                        <div className="absolute top-3 left-3">
                          <Badge className={getRecommendationBadge(rec.recommendation)}>
                            {rec.recommendation}
                          </Badge>
                        </div>
                      </div>

                      {/* Info Section (60%) */}
                      <div className="md:w-3/5 p-4 space-y-3">
                        {/* Price + Address */}
                        <div>
                          <div className="text-2xl font-bold text-green-600">
                            {formatPrice(rec.listing.price)}
                          </div>
                          <div className="font-semibold text-gray-800 mt-1">
                            {rec.listing.address}
                          </div>
                          <div className="text-sm text-gray-600 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {rec.listing.city}, {rec.listing.state}
                          </div>
                        </div>

                        {/* Specs Row */}
                        <div className="flex items-center gap-4 text-sm text-gray-700">
                          <div className="flex items-center gap-1">
                            <Bed className="h-4 w-4" />
                            {rec.listing.bedrooms} beds
                          </div>
                          <div className="flex items-center gap-1">
                            <Bath className="h-4 w-4" />
                            {rec.listing.bathrooms} baths
                          </div>
                          {rec.listing.square_feet && (
                            <div className="flex items-center gap-1">
                              <Maximize className="h-4 w-4" />
                              {rec.listing.square_feet.toLocaleString()} sqft
                            </div>
                          )}
                        </div>

                        {/* One-line Summary */}
                        <div className="text-sm italic text-gray-600">
                          "{rec.one_line_summary}"
                        </div>

                        {/* Quick Scan Icons */}
                        <div className="space-y-1">
                          {/* Verified Features */}
                          {rec.professional_assessment.what_i_verified.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-green-700">
                              <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-1">{item}</span>
                            </div>
                          ))}

                          {/* Concerns */}
                          {rec.professional_assessment.honest_concerns.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-amber-700">
                              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-1">{item}</span>
                            </div>
                          ))}

                          {/* Opportunities */}
                          {rec.professional_assessment.hidden_opportunities.slice(0, 1).map((item, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-purple-700">
                              <Star className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-1">{item}</span>
                            </div>
                          ))}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" className="flex-1">
                            View Details
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleCard(rec.listing.id)}
                            className="flex items-center gap-1"
                          >
                            {isExpanded ? (
                              <>Less <ChevronUp className="h-3 w-3" /></>
                            ) : (
                              <>More <ChevronDown className="h-3 w-3" /></>
                            )}
                          </Button>
                        </div>

                        {/* Expandable Details */}
                        {isExpanded && (
                          <div className="border-t pt-3 mt-3 space-y-3">
                            {/* Agent Briefing */}
                            <div className="bg-blue-50 p-3 rounded-lg">
                              <h4 className="font-semibold text-xs mb-2 text-blue-900">Agent's Take</h4>
                              <p className="text-xs text-gray-700">{rec.agent_briefing}</p>
                            </div>

                            {/* Why This Recommendation */}
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <h4 className="font-semibold text-xs mb-2">Why {rec.recommendation}</h4>
                              <p className="text-xs text-gray-700">{rec.why_this_recommendation}</p>
                            </div>

                            {/* Full Professional Assessment */}
                            <div className="grid grid-cols-1 gap-2">
                              {rec.professional_assessment.what_i_verified.length > 2 && (
                                <div className="bg-green-50 p-2 rounded">
                                  <h5 className="font-semibold text-xs mb-1 text-green-900">All Verified Features</h5>
                                  <ul className="text-xs text-green-800 space-y-0.5">
                                    {rec.professional_assessment.what_i_verified.slice(2).map((item, idx) => (
                                      <li key={idx}>• {item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {rec.professional_assessment.honest_concerns.length > 2 && (
                                <div className="bg-amber-50 p-2 rounded">
                                  <h5 className="font-semibold text-xs mb-1 text-amber-900">All Concerns</h5>
                                  <ul className="text-xs text-amber-800 space-y-0.5">
                                    {rec.professional_assessment.honest_concerns.slice(2).map((item, idx) => (
                                      <li key={idx}>• {item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {rec.professional_assessment.hidden_opportunities.length > 1 && (
                                <div className="bg-purple-50 p-2 rounded">
                                  <h5 className="font-semibold text-xs mb-1 text-purple-900">More Opportunities</h5>
                                  <ul className="text-xs text-purple-800 space-y-0.5">
                                    {rec.professional_assessment.hidden_opportunities.slice(1).map((item, idx) => (
                                      <li key={idx}>• {item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>

                            {/* Next Steps */}
                            <div className="bg-gray-100 p-2 rounded">
                              <h4 className="font-semibold text-xs mb-1">Next Steps</h4>
                              <p className="text-xs text-gray-700">{rec.next_steps}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </TabsContent>

            {/* Market Overview Tab */}
            <TabsContent value="market" className="space-y-4">
              {/* Filter Buttons */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={marketFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setMarketFilter('all')}
                >
                  All ({searchResults.market_overview.length})
                </Button>
                <Button
                  size="sm"
                  variant={marketFilter === 'clean' ? 'default' : 'outline'}
                  onClick={() => setMarketFilter('clean')}
                >
                  Clean ({searchResults.market_overview.filter(p => !p.is_dealbreaker).length})
                </Button>
                <Button
                  size="sm"
                  variant={marketFilter === 'dealbreakers' ? 'default' : 'outline'}
                  onClick={() => setMarketFilter('dealbreakers')}
                >
                  Dealbreakers ({searchResults.market_overview.filter(p => p.is_dealbreaker).length})
                </Button>
              </div>

              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left p-4 font-medium">Property</th>
                          <th className="text-left p-4 font-medium">Price</th>
                          <th className="text-left p-4 font-medium">Beds/Baths</th>
                          <th className="text-left p-4 font-medium">Score</th>
                          <th className="text-left p-4 font-medium">Status</th>
                          <th className="text-left p-4 font-medium">Dealbreaker</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMarket.map((property, index) => (
                          <tr key={property.listing.id || index} className="border-b hover:bg-gray-50">
                            <td className="p-4">
                              <div className="font-medium">{property.listing.address}</div>
                              <div className="text-sm text-gray-600">
                                {property.listing.city}, {property.listing.state}
                              </div>
                            </td>
                            <td className="p-4 font-semibold">{formatPrice(property.listing.price)}</td>
                            <td className="p-4">{property.listing.bedrooms}BR / {property.listing.bathrooms}BA</td>
                            <td className="p-4">
                              <Badge variant="outline">{property.score}/100</Badge>
                            </td>
                            <td className="p-4">
                              {property.is_dealbreaker ? (
                                <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                                  <AlertCircle className="h-3 w-3" />
                                  Dealbreaker
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                                  <CheckCircle className="h-3 w-3" />
                                  Clean
                                </Badge>
                              )}
                            </td>
                            <td className="p-4">
                              {property.is_dealbreaker && property.dealbreaker_reasons.length > 0 ? (
                                <div className="group relative">
                                  <div className="text-xs text-red-600 cursor-help">
                                    {property.dealbreaker_reasons[0].type}
                                  </div>
                                  {/* Hover tooltip */}
                                  <div className="invisible group-hover:visible absolute z-10 w-64 p-2 bg-white border border-red-200 rounded shadow-lg text-xs left-0 top-full mt-1">
                                    <div className="font-semibold text-red-800 mb-1">
                                      {property.dealbreaker_reasons[0].type}
                                    </div>
                                    <div className="text-gray-700 italic">
                                      "{property.dealbreaker_reasons[0].evidence}"
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

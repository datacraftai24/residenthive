import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, History, Clock, Home, MapPin, DollarSign, Bed, Bath } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { SavePropertyButton } from './save-property-button';
import type { BuyerProfile } from '@shared/schema';

interface NLPSearchResult {
  search_type: string;
  total_found: number;
  execution_time: number;
  listings: any[];
  nlp_summary: string;
  nlp_id: string;
  search_url: string;
  search_log_id: number;
  image_search_available: boolean;
  profile_data: {
    id: number;
    name: string;
    location: string;
  };
}

interface SearchHistoryItem {
  id: number;
  query: string;
  summary: string;
  results_count: number;
  execution_time: number;
  nlp_id: string;
  created_at: string;
}

interface NLPListingSearchProps {
  profile: BuyerProfile;
  onListingSelect?: (listing: any) => void;
}

export function NLPListingSearch({ profile, onListingSelect }: NLPListingSearchProps) {
  const [refinementText, setRefinementText] = useState('');
  const [currentNlpId, setCurrentNlpId] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  const queryClient = useQueryClient();

  // Fetch search history
  const { data: historyData } = useQuery({
    queryKey: ['/api/listings/nlp-history', profile.id],
    queryFn: async () => {
      const response = await fetch(`/api/listings/nlp-history/${profile.id}`);
      if (!response.ok) throw new Error('Failed to fetch search history');
      return response.json();
    }
  });

  React.useEffect(() => {
    if (historyData) {
      setSearchHistory(historyData.searches || []);
    }
  }, [historyData]);

  // NLP Search mutation
  const nlpSearchMutation = useMutation({
    mutationFn: async ({ contextNlpId, refinementText }: { contextNlpId?: string; refinementText?: string }): Promise<NLPSearchResult> => {
      const response = await fetch(`/api/listings/search-nlp/${profile.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contextNlpId && refinementText ? { contextNlpId, refinementText } : {})
      });
      
      if (!response.ok) {
        throw new Error('Failed to perform NLP search');
      }
      
      return response.json();
    },
    onSuccess: (data: NLPSearchResult) => {
      setCurrentNlpId(data.nlp_id);
      queryClient.invalidateQueries({ queryKey: ['/api/listings/nlp-history', profile.id] });
    }
  });

  const handleInitialSearch = () => {
    nlpSearchMutation.mutate({});
  };

  const handleRefinement = () => {
    if (!refinementText.trim() || !currentNlpId) return;
    
    nlpSearchMutation.mutate({
      contextNlpId: currentNlpId,
      refinementText: refinementText.trim()
    });
    
    setRefinementText('');
  };

  const handleHistorySearch = (historyItem: SearchHistoryItem) => {
    setCurrentNlpId(historyItem.nlp_id);
    // Could potentially re-run this search or show its results
    setShowHistory(false);
  };

  const searchResult = nlpSearchMutation.data;
  const isSearching = nlpSearchMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Profile Context Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Home className="h-5 w-5" />
            Smart Property Search for {profile.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{profile.location}</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>{profile.budget}</span>
            </div>
            <div className="flex items-center gap-2">
              <Bed className="h-4 w-4 text-muted-foreground" />
              <span>{profile.bedrooms} bedrooms</span>
            </div>
            <div className="flex items-center gap-2">
              <Bath className="h-4 w-4 text-muted-foreground" />
              <span>{profile.bathrooms} bathrooms</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              AI-Powered Property Search
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2"
            >
              <History className="h-4 w-4" />
              History ({(historyData as any)?.search_count || 0})
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Initial Search */}
          {!searchResult && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Click below to start an AI-powered search based on {profile.name}'s profile preferences.
              </p>
              <Button 
                onClick={handleInitialSearch} 
                disabled={isSearching}
                className="w-full"
              >
                {isSearching ? 'Searching...' : 'Start Smart Search'}
              </Button>
            </div>
          )}

          {/* Refinement Search */}
          {searchResult && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Refine your search (e.g., 'prefer newer homes', 'closer to schools')"
                  value={refinementText}
                  onChange={(e) => setRefinementText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleRefinement()}
                />
                <Button 
                  onClick={handleRefinement}
                  disabled={isSearching || !refinementText.trim() || !currentNlpId}
                >
                  Refine
                </Button>
              </div>
            </div>
          )}

          {/* Search History */}
          {showHistory && searchHistory.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Recent Searches</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {searchHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleHistorySearch(item)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{item.summary}</p>
                      <Badge variant="outline" className="ml-2">
                        {item.results_count} results
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                      <span>{item.execution_time}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Results */}
      {isSearching && (
        <Card>
          <CardHeader>
            <CardTitle>Searching Properties...</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-48 w-full" />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {searchResult && !isSearching && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Search Results</span>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <Badge variant={searchResult.total_found > 0 ? "default" : "secondary"}>
                  {searchResult.total_found} properties found
                </Badge>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {searchResult.execution_time}ms
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Search Summary */}
            <div className="mb-4 p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">AI Search Summary:</p>
              <p className="text-sm font-medium">{searchResult.nlp_summary}</p>
              {searchResult.total_found === 0 && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                  <p className="text-yellow-700">
                    <strong>No properties found:</strong> This location may have limited inventory. 
                    Try refining with "broader area" or "different price range".
                  </p>
                </div>
              )}
            </div>

            {/* Listings Grid */}
            {searchResult.total_found > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchResult.listings.map((listing: any, index: number) => (
                  <Card 
                    key={index} 
                    className="hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <h4 
                            className="font-medium truncate cursor-pointer hover:text-blue-600" 
                            onClick={() => onListingSelect?.(listing)}
                          >
                            {listing.address || 'Property Address'}
                          </h4>
                          <Badge variant="outline">${listing.price?.toLocaleString() || 'N/A'}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{listing.bedrooms || '—'} bed</span>
                          <span>{listing.bathrooms || '—'} bath</span>
                          <span>{listing.squareFootage || '—'} sqft</span>
                        </div>
                        {listing.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {listing.description}
                          </p>
                        )}
                        <div className="pt-2 flex justify-end">
                          <SavePropertyButton
                            profileId={profile.id}
                            listingId={listing.id}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Home className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="font-medium mb-2">No properties found</h3>
                <p className="text-sm">Try refining your search criteria above</p>
              </div>
            )}

            {/* Debug Information */}
            {searchResult.search_url && (
              <details className="mt-4 text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Technical Details
                </summary>
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <p>NLP ID: {searchResult.nlp_id}</p>
                  <p>Search URL: <code className="bg-muted px-1 rounded text-xs">{searchResult.search_url}</code></p>
                  <p>Image Search Available: {searchResult.image_search_available ? 'Yes' : 'No'}</p>
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
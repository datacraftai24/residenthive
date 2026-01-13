import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Grid, List, MapPin, Bed, Bath, Square, DollarSign, Calendar, Eye, Share2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface SearchFilters {
  location: string;
  minPrice: string;
  maxPrice: string;
  minBedrooms: string;
  maxBedrooms: string;
  propertyType: string;
}

interface Property {
  mlsNumber: string;
  listPrice: number;
  address: {
    streetNumber: string;
    streetName: string;
    city: string;
    state: string;
    zip: string;
  };
  details: {
    numBedrooms: number;
    numBathrooms: number;
    sqft: string;
    style: string;
    description: string;
    yearBuilt: string;
  };
  images: string[];
  photoCount: number;
  daysOnMarket?: number;
  map: {
    latitude: number;
    longitude: number;
  };
}

interface SearchResponse {
  listings: Property[];
  count: number;
}

export function AgentSearchDashboard() {
  const [filters, setFilters] = useState<SearchFilters>({
    location: 'Quincy, MA',
    minPrice: '',
    maxPrice: '',
    minBedrooms: 'any',
    maxBedrooms: 'any',
    propertyType: 'all'
  });
  
  const [activeView, setActiveView] = useState<'grid' | 'cards'>('grid');
  const [hasSearched, setHasSearched] = useState(false);

  const { data: searchResults, isLoading, refetch } = useQuery<SearchResponse>({
    queryKey: ['/api/agent-search', filters],
    enabled: hasSearched,
    staleTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const handleSearch = () => {
    setHasSearched(true);
    refetch();
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(price);
  };

  const getPropertyImage = (property: Property) => {
    if (property.images && property.images.length > 0) {
      return `https://images.repliers.io/${property.images[0]}`;
    }
    return '/api/placeholder/400/300';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Agent Search Dashboard</h1>
          <p className="text-gray-600">Find and analyze properties for your clients</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={activeView === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveView('grid')}
          >
            <List className="h-4 w-4 mr-2" />
            Market Overview
          </Button>
          <Button
            variant={activeView === 'cards' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveView('cards')}
          >
            <Grid className="h-4 w-4 mr-2" />
            Property Details
          </Button>
        </div>
      </div>

      {/* Search Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Search Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">Location(s)</Label>
              <Input
                id="location"
                value={filters.location}
                onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                placeholder="Boston, Quincy or South Shore"
              />
              <p className="text-xs text-muted-foreground">Multiple cities or regions</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="minPrice">Min Price</Label>
              <Input
                id="minPrice"
                type="number"
                value={filters.minPrice}
                onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
                placeholder="100000"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="maxPrice">Max Price</Label>
              <Input
                id="maxPrice"
                type="number"
                value={filters.maxPrice}
                onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
                placeholder="1000000"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="minBedrooms">Min Bedrooms</Label>
              <Select value={filters.minBedrooms} onValueChange={(value) => setFilters({ ...filters, minBedrooms: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="1">1+</SelectItem>
                  <SelectItem value="2">2+</SelectItem>
                  <SelectItem value="3">3+</SelectItem>
                  <SelectItem value="4">4+</SelectItem>
                  <SelectItem value="5">5+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="maxBedrooms">Max Bedrooms</Label>
              <Select value={filters.maxBedrooms} onValueChange={(value) => setFilters({ ...filters, maxBedrooms: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="4">4</SelectItem>
                  <SelectItem value="5">5+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="propertyType">Property Type</Label>
              <Select value={filters.propertyType} onValueChange={(value) => setFilters({ ...filters, propertyType: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Single Family Residence">Single Family</SelectItem>
                  <SelectItem value="Condominium">Condominium</SelectItem>
                  <SelectItem value="Townhouse">Townhouse</SelectItem>
                  <SelectItem value="Multi-Family">Multi-Family</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex items-center justify-between mt-6">
            <Button onClick={handleSearch} disabled={isLoading} className="px-8">
              {isLoading ? 'Searching...' : 'Search Properties'}
            </Button>
            
            {searchResults && (
              <div className="text-sm text-gray-600">
                Found {searchResults.count || 0} properties
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {hasSearched && (
        <div className="space-y-6">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Searching properties...</p>
            </div>
          ) : searchResults?.listings ? (
            <>
              {activeView === 'grid' ? (
                <MarketGridView properties={searchResults.listings} />
              ) : (
                <PropertyCardsView properties={searchResults.listings} />
              )}
            </>
          ) : hasSearched && (
            <div className="text-center py-12">
              <p className="text-gray-600">No properties found. Try adjusting your search criteria.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Market Grid View Component
function MarketGridView({ properties }: { properties: Property[] }) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(price);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <List className="h-5 w-5" />
          Market Overview ({properties.length} properties)
        </CardTitle>
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
              {properties.map((property) => (
                <tr key={property.mlsNumber} className="border-b hover:bg-gray-50">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={`https://images.repliers.io/${property.images?.[0] || ''}`}
                        alt="Property"
                        className="w-16 h-12 rounded object-cover"
                        onError={(e) => {
                          e.currentTarget.src = '/api/placeholder/64/48';
                        }}
                      />
                      <div>
                        <div className="font-medium">
                          {property.address.streetNumber} {property.address.streetName}
                        </div>
                        <div className="text-sm text-gray-600">
                          {property.address.city}, {property.address.state} {property.address.zip}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 font-semibold">{formatPrice(property.listPrice)}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Bed className="h-4 w-4" />
                        {property.details.numBedrooms}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bath className="h-4 w-4" />
                        {property.details.numBathrooms}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="flex items-center gap-1">
                      <Square className="h-4 w-4" />
                      {property.details.sqft ? `${property.details.sqft} sq ft` : 'N/A'}
                    </span>
                  </td>
                  <td className="p-4">
                    <Badge variant="secondary">{property.details.style}</Badge>
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

// Property Cards View Component (Zillow-style)
function PropertyCardsView({ properties }: { properties: Property[] }) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(price);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {properties.slice(0, 10).map((property) => (
        <Card key={property.mlsNumber} className="overflow-hidden hover:shadow-lg transition-shadow">
          <div className="aspect-video relative">
            <img
              src={`https://images.repliers.io/${property.images?.[0] || ''}`}
              alt="Property"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = '/api/placeholder/400/300';
              }}
            />
            <div className="absolute top-4 left-4">
              <Badge className="bg-red-600 text-white">For Sale</Badge>
            </div>
            <div className="absolute top-4 right-4">
              <Badge variant="secondary">{property.photoCount} photos</Badge>
            </div>
          </div>
          
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* Price and Key Stats */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-3xl font-bold">{formatPrice(property.listPrice)}</div>
                  <div className="text-gray-600">
                    {property.address.streetNumber} {property.address.streetName}
                  </div>
                  <div className="text-gray-600">
                    {property.address.city}, {property.address.state} {property.address.zip}
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-semibold">{property.details.numBedrooms}</div>
                      <div className="text-sm text-gray-600">beds</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-semibold">{property.details.numBathrooms}</div>
                      <div className="text-sm text-gray-600">baths</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-semibold">
                        {property.details.sqft ? property.details.sqft.replace(/,/g, '') : 'N/A'}
                      </div>
                      <div className="text-sm text-gray-600">sqft</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Property Details */}
              <div className="grid grid-cols-3 gap-4 py-4 border-t border-b">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Single Family</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Built in {property.details.yearBuilt || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">
                    {property.daysOnMarket ? `${property.daysOnMarket} days` : 'New'}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-gray-700 text-sm line-clamp-3">
                  {property.details.description || 'No description available.'}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button className="flex-1">
                  Request tour
                </Button>
                <Button variant="outline" className="flex-1">
                  Contact agent
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
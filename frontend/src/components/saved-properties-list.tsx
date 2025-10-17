import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Home, Bed, Bath, MapPin, DollarSign } from 'lucide-react';
import type { BuyerProfile } from '@shared/schema';
import { SavePropertyButton } from './save-property-button';

interface SavedPropertiesListProps {
  profile: BuyerProfile;
}

export function SavedPropertiesList({ profile }: SavedPropertiesListProps) {
  const { data, isLoading } = useQuery({
    queryKey: [`/api/buyer-profiles/${profile.id}/properties`],
    queryFn: async () => {
      const response = await fetch(`/api/buyer-profiles/${profile.id}/properties`);
      if (!response.ok) throw new Error('Failed to fetch saved properties');
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const properties = data?.properties || [];

  if (properties.length === 0) {
    return (
      <Card>
        <CardContent className="pt-12 pb-12 text-center">
          <Home className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <h3 className="font-medium text-lg mb-2">No saved properties yet</h3>
          <p className="text-sm text-gray-600">
            Save properties from search results to see them here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Saved Properties ({properties.length})
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {properties.map((property: any) => (
          <Card key={property.listing_id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{property.address || 'Property Address'}</h4>
                    <p className="text-xs text-gray-600 flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" />
                      {property.city}, {property.state} {property.zip_code}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {property.interaction_type}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-blue-600 flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    {property.price?.toLocaleString() || 'N/A'}
                  </span>
                  <div className="flex gap-3 text-gray-600 text-xs">
                    <span className="flex items-center gap-1">
                      <Bed className="h-3 w-3" />
                      {property.bedrooms || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Bath className="h-3 w-3" />
                      {property.bathrooms || 0}
                    </span>
                  </div>
                </div>

                {property.reason && (
                  <p className="text-xs text-gray-700 italic border-l-2 border-blue-300 pl-2">
                    {property.reason}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <SavePropertyButton
                    profileId={profile.id}
                    listingId={property.listing_id}
                    isSaved={true}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

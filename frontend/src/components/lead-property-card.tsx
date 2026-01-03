import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Home, Bed, Bath, Ruler, DollarSign, MapPin } from "lucide-react";

interface LeadPropertyCardProps {
  address: string | null;
  listPrice: number | null;
  bedrooms: number | null;
  bathrooms: string | null;
  sqft: number | null;
  imageUrl: string | null;
  listingId: string | null;
  source: string;
}

export function LeadPropertyCard({
  address,
  listPrice,
  bedrooms,
  bathrooms,
  sqft,
  imageUrl,
  listingId,
  source,
}: LeadPropertyCardProps) {
  if (!address && !listPrice) {
    return null;
  }

  return (
    <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
          <Home className="h-4 w-4" />
          Original Property Interest
          <Badge variant="secondary" className="ml-auto text-xs">
            {source.charAt(0).toUpperCase() + source.slice(1)} Lead
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          {/* Property Image */}
          {imageUrl && (
            <div className="w-24 h-20 rounded-lg overflow-hidden flex-shrink-0">
              <img
                src={imageUrl}
                alt="Property"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Property Details */}
          <div className="flex-1 min-w-0">
            {address && (
              <div className="flex items-start gap-1 mb-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-sm font-medium truncate">{address}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {listPrice && (
                <div className="flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-sm font-semibold">
                    ${listPrice.toLocaleString()}
                  </span>
                </div>
              )}
              {bedrooms && (
                <div className="flex items-center gap-1.5">
                  <Bed className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-sm">{bedrooms} beds</span>
                </div>
              )}
              {bathrooms && (
                <div className="flex items-center gap-1.5">
                  <Bath className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-sm">{bathrooms} baths</span>
                </div>
              )}
              {sqft && (
                <div className="flex items-center gap-1.5">
                  <Ruler className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-sm">{sqft.toLocaleString()} sqft</span>
                </div>
              )}
            </div>

            {listingId && (
              <p className="text-xs text-muted-foreground mt-2">
                MLS# {listingId}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

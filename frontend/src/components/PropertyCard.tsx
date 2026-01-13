import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bed, Bath, Maximize, MapPin } from "lucide-react";

interface PropertyCardProps {
  listing: {
    mlsNumber: string;
    address: string;
    city: string;
    listPrice: number;
    bedrooms: number;
    bathrooms: number;
    sqft: number;
    images: string[];
    fitScore?: number;
  };
  rank: number;
  onViewDetails: () => void;
}

export function PropertyCard({ listing, rank, onViewDetails }: PropertyCardProps) {
  const rankLabel = rank === 1 ? "TOP PICK" : rank === 2 ? "ALTERNATIVE" : "OPTION";
  const rankColor = rank === 1 ? "bg-green-600" : rank === 2 ? "bg-blue-600" : "bg-gray-600";

  return (
    <Card
      className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
      onClick={onViewDetails}
    >
      {/* Image */}
      <div className="relative h-40 overflow-hidden">
        <img
          src={listing.images?.[0] || "/placeholder-property.jpg"}
          alt={listing.address}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
        />
        <Badge className={`absolute top-2 left-2 ${rankColor} text-white`}>
          #{rank} {rankLabel}
        </Badge>
        {listing.fitScore && listing.fitScore > 0 && (
          <Badge className="absolute top-2 right-2 bg-white/90 text-gray-900">
            {Math.round(listing.fitScore * 100)}% match
          </Badge>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="font-semibold text-lg text-gray-900 mb-1">
          ${listing.listPrice?.toLocaleString()}
        </div>

        <div className="flex items-center gap-3 text-sm text-gray-600 mb-2">
          <span className="flex items-center gap-1">
            <Bed className="h-3.5 w-3.5" /> {listing.bedrooms}
          </span>
          <span className="flex items-center gap-1">
            <Bath className="h-3.5 w-3.5" /> {listing.bathrooms}
          </span>
          <span className="flex items-center gap-1">
            <Maximize className="h-3.5 w-3.5" /> {listing.sqft?.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center gap-1 text-sm text-gray-500 truncate">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
          {listing.address}, {listing.city}
        </div>

        <Button variant="outline" size="sm" className="w-full mt-3">
          View Details
        </Button>
      </div>
    </Card>
  );
}

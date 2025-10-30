import { FileText, List } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Property {
  description: string | null;
  features: string | null;
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  square_feet: number;
  lot_size: number | null;
  year_built: number | null;
  garage_spaces: number | null;
}

interface PropertyOverviewProps {
  property: Property;
}

export default function PropertyOverview({ property }: PropertyOverviewProps) {
  // Parse features string (could be JSON or comma-separated)
  const parseFeatures = (features: string | null): string[] => {
    if (!features) return [];

    try {
      // Try parsing as JSON first
      const parsed = JSON.parse(features);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === "object") return Object.values(parsed);
    } catch {
      // If not JSON, try splitting by commas or newlines
      return features
        .split(/[,\n]/)
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    }

    return [];
  };

  const features = parseFeatures(property.features);

  return (
    <div className="space-y-6">
      {/* Property Description */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Property Description
          </CardTitle>
        </CardHeader>
        <CardContent>
          {property.description ? (
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">
              {property.description}
            </p>
          ) : (
            <p className="text-gray-500 italic">
              No description available for this property.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Property Features */}
      {features.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              Property Features
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {features.map((feature, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-gray-700"
                >
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Property Details */}
      <Card>
        <CardHeader>
          <CardTitle>Property Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Property Type:</span>
              <span className="font-medium text-gray-900">{property.property_type}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Bedrooms:</span>
              <span className="font-medium text-gray-900">{property.bedrooms}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Bathrooms:</span>
              <span className="font-medium text-gray-900">{property.bathrooms}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Square Feet:</span>
              <span className="font-medium text-gray-900">
                {property.square_feet?.toLocaleString() || "N/A"}
              </span>
            </div>
            {property.lot_size && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">Lot Size:</span>
                <span className="font-medium text-gray-900">
                  {property.lot_size.toFixed(2)} acres
                </span>
              </div>
            )}
            {property.year_built && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">Year Built:</span>
                <span className="font-medium text-gray-900">{property.year_built}</span>
              </div>
            )}
            {property.garage_spaces && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">Garage Spaces:</span>
                <span className="font-medium text-gray-900">{property.garage_spaces}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

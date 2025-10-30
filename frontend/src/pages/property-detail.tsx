import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Share2, Heart, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ImageGallery from "@/components/property-detail/ImageGallery";
import AIInsights from "@/components/property-detail/AIInsights";
import InvestmentMetrics from "@/components/property-detail/InvestmentMetrics";
import PropertyOverview from "@/components/property-detail/PropertyOverview";

interface PropertyImage {
  id: number;
  image_url: string;
  image_order: number;
  ai_description: string | null;
  visual_tags: string[] | null;
}

interface PropertyInsights {
  estimated_rental: number | null;
  price_per_sqft: number | null;
  investment_summary: string | null;
  risk_factors: string[] | null;
  market_trends: Record<string, any> | null;
  cap_rate: number | null;
  roi_estimate: number | null;
}

interface AIAnalysis {
  analysis_json: {
    headline: string;
    agent_insight: string;
    why_it_works: {
      budget: string;
      location: string;
      lifestyle_fit?: string;
      family_fit?: string;
      investment_fit?: string;
    };
    considerations: string[];
    dealbreaker_flags: string[];
    score_breakdown: Record<string, number>;
  };
  score: number;
}

interface PropertyData {
  id: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  square_feet: number;
  property_type: string;
  description: string | null;
  features: string | null;
  mls_number: string | null;
  lot_size: number | null;
  year_built: number | null;
  garage_spaces: number | null;
  listing_date: string | null;
  status: string;
}

interface PropertyDetailResponse {
  property: PropertyData;
  images: PropertyImage[];
  insights: PropertyInsights | null;
  ai_analysis: AIAnalysis | null;
  interaction_status: {
    interaction_type: string;
    rating: number | null;
    reason: string | null;
  } | null;
}

export default function PropertyDetail() {
  const [match, params] = useRoute("/property/:id");
  const [, setLocation] = useLocation();
  const listingId = params?.id;

  // Get profile_id from URL search params if available
  const urlParams = new URLSearchParams(window.location.search);
  const profileId = urlParams.get("profile_id");

  const { data, isLoading, error } = useQuery<PropertyDetailResponse>({
    queryKey: [`/api/properties/${listingId}`, profileId],
    enabled: !!listingId,
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(price);
  };

  if (!match || !listingId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-600">Property not found</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-red-600 mb-4">Error loading property details</p>
        <Button onClick={() => setLocation("/")}>Back to Dashboard</Button>
      </div>
    );
  }

  if (isLoading) {
    return <PropertyDetailSkeleton />;
  }

  if (!data) {
    return null;
  }

  const { property, images, insights, ai_analysis, interaction_status } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setLocation("/")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Search
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" size="sm">
                <Heart
                  className={`h-4 w-4 mr-2 ${
                    interaction_status?.interaction_type === "saved"
                      ? "fill-red-500 text-red-500"
                      : ""
                  }`}
                />
                {interaction_status?.interaction_type === "saved"
                  ? "Saved"
                  : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image Gallery */}
            <ImageGallery images={images} property={property} />

            {/* Property Header */}
            <div>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-4xl font-bold text-gray-900 mb-2">
                    {formatPrice(property.price)}
                  </h1>
                  <p className="text-xl text-gray-700">{property.address}</p>
                  <p className="text-lg text-gray-600">
                    {property.city}, {property.state} {property.zip_code}
                  </p>
                </div>
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  {property.status}
                </Badge>
              </div>

              {/* Key Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6 border-t border-b">
                <div>
                  <div className="text-3xl font-bold text-gray-900">
                    {property.bedrooms}
                  </div>
                  <div className="text-sm text-gray-600">Bedrooms</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-gray-900">
                    {property.bathrooms}
                  </div>
                  <div className="text-sm text-gray-600">Bathrooms</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-gray-900">
                    {property.square_feet?.toLocaleString() || "N/A"}
                  </div>
                  <div className="text-sm text-gray-600">Sq Ft</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-gray-900">
                    {property.year_built || "N/A"}
                  </div>
                  <div className="text-sm text-gray-600">Year Built</div>
                </div>
              </div>

              {/* Additional Details */}
              <div className="grid grid-cols-2 gap-4 py-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Property Type:</span>
                  <span className="font-medium">{property.property_type}</span>
                </div>
                {property.lot_size && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Lot Size:</span>
                    <span className="font-medium">
                      {property.lot_size.toLocaleString()} acres
                    </span>
                  </div>
                )}
                {property.garage_spaces && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Garage:</span>
                    <span className="font-medium">
                      {property.garage_spaces} spaces
                    </span>
                  </div>
                )}
                {property.mls_number && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">MLS #:</span>
                    <span className="font-medium">{property.mls_number}</span>
                  </div>
                )}
              </div>
            </div>

            {/* AI Insights (if available) */}
            {ai_analysis && <AIInsights analysis={ai_analysis} />}

            {/* Property Overview */}
            <PropertyOverview property={property} />
          </div>

          {/* Right Column - Investment Metrics & Actions */}
          <div className="space-y-6">
            {/* Investment Metrics */}
            {insights && (
              <InvestmentMetrics insights={insights} property={property} />
            )}

            {/* Agent Actions */}
            <Card className="p-6 sticky top-24">
              <h3 className="font-semibold text-lg mb-4">Agent Actions</h3>
              <div className="space-y-3">
                <Button className="w-full">Schedule Tour</Button>
                <Button variant="outline" className="w-full">
                  Contact Agent
                </Button>
                <Button variant="outline" className="w-full">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on MLS
                </Button>
                <Button variant="outline" className="w-full">
                  Add Notes
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertyDetailSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

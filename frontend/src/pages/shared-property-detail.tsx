import React, { useState } from 'react';
import { useParams, useSearch } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClientSummaryDeep } from '@/components/ClientSummaryDeep';
import {
  ArrowLeft,
  Bed,
  Bath,
  Square,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Home,
  Car,
  CheckCircle,
  AlertTriangle,
  Navigation
} from 'lucide-react';

interface PropertyData {
  listingId: string;
  mlsNumber: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  propertyType: string | null;
  yearBuilt: number | null;
  description: string | null;
  features: string | null;
  lotSize: number | null;
  garageSpaces: number | null;
  status: string | null;
  images: string[];
}

interface AIAnalysis {
  text?: {
    headline?: string;
    whats_matching?: any[];
    whats_missing?: any[];
    red_flags?: any[];
    fit_score?: number;
    agent_take?: string;
  };
  photos?: {
    photo_headline?: string;
    photo_summary?: string;
    photo_matches?: any[];
    photo_red_flags?: any[];
  };
  location?: {
    location_match_score?: number;
    location_summary?: any;
    location_flags?: any[];
  };
}

interface AgentInfo {
  name: string;
  email: string | null;
  phone: string | null;
}

interface SharedPropertyDetailData {
  property: PropertyData;
  aiAnalysis: AIAnalysis | null;
  agent: AgentInfo;
  reportUrl: string;
}

export function SharedPropertyDetail() {
  const params = useParams();
  const shareId = params.shareId;
  const listingId = params.listingId;

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const { data, isLoading, error } = useQuery<SharedPropertyDetailData>({
    queryKey: ['shared-property', shareId, listingId],
    queryFn: async () => {
      const response = await fetch(`/api/buyer-reports/shared/reports/${shareId}/property/${listingId}`);
      if (!response.ok) {
        throw new Error('Property not found');
      }
      return response.json();
    },
    enabled: !!shareId && !!listingId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading property details...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <h2 className="text-xl font-bold text-red-600 mb-2">Property Not Found</h2>
            <p className="text-gray-600 mb-4">
              This property could not be found. It may have been removed or the link is invalid.
            </p>
            <Button asChild variant="outline">
              <a href={data?.reportUrl || '/'}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Report
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { property, aiAnalysis, agent, reportUrl } = data;
  const images = property.images || [];
  const hasImages = images.length > 0;

  // Calculate fit score from text analysis
  const fitScore = aiAnalysis?.text?.fit_score;
  const locationScore = aiAnalysis?.location?.location_match_score;

  // Strict validation for location score - hide if not a clean displayable number
  const isValidLocationScore =
    typeof locationScore === 'number' &&
    Number.isFinite(locationScore) &&
    locationScore > 0 &&
    locationScore <= 100;

  // Encoded email subject for mailto links (handles special chars in address)
  const emailSubject = encodeURIComponent(`Question about ${property.address}`);

  // Map backend level to frontend type for location flags
  const getFlagType = (level: string) => {
    if (level === 'green') return 'positive';
    if (level === 'yellow' || level === 'orange') return 'warning';
    return 'neutral';
  };

  // Transform to friendly labels - code first (stable), message fallback (brittle)
  const getFriendlyLabel = (flag: any): string => {
    const code = flag.code || '';
    const message = flag.message || '';

    // Code-based mapping (stable - won't break if backend wording changes)
    if (code === 'QUIET_RESIDENTIAL') return 'Quiet street';
    if (code === 'FAMILY_FRIENDLY_AREA') return 'Family-friendly area';
    if (code === 'EXCELLENT_WALKABILITY') return 'Very walkable';
    if (code === 'GOOD_TRANSIT') return 'Good transit';
    if (code === 'NEAR_PARKS') return 'Near parks';

    // Message-based fallback (for codes we haven't mapped yet)
    if (message.includes('Low traffic')) return 'Quiet street';
    if (message.includes('parks/playgrounds')) return 'Near parks';
    if (message.includes('walkable')) return 'Very walkable';

    // Last resort: truncate raw message
    return message.replace(/\.$/, '').slice(0, 40);
  };

  // Build listing object for ClientSummaryDeep
  const listingForAnalysis = {
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    yearBuilt: property.yearBuilt,
    aiAnalysis: {
      whats_matching: aiAnalysis?.text?.whats_matching || [],
      whats_missing: aiAnalysis?.text?.whats_missing || [],
      red_flags: aiAnalysis?.text?.red_flags || [],
      photo_matches: aiAnalysis?.photos?.photo_matches || [],
      photo_red_flags: aiAnalysis?.photos?.photo_red_flags || [],
      agent_take_ai: aiAnalysis?.text?.agent_take,
      fit_score: fitScore,
      vision_complete: true,  // Photos already analyzed when report was created
    }
  };

  const navigateImage = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
    } else {
      setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <a href={reportUrl}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Report
            </a>
          </Button>
          <div className="flex items-center gap-2">
            {agent.phone && (
              <Button asChild variant="outline" size="sm">
                <a href={`tel:${agent.phone}`}>
                  <Phone className="h-4 w-4 mr-1" />
                  Call
                </a>
              </Button>
            )}
            {agent.email && (
              <Button asChild size="sm">
                <a href={`mailto:${agent.email}?subject=Question about ${property.address}`}>
                  <Mail className="h-4 w-4 mr-1" />
                  Email Agent
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Image Gallery */}
        <div className="mb-6">
          {hasImages ? (
            <div className="relative aspect-[16/9] bg-gray-200 rounded-lg overflow-hidden">
              <img
                src={images[currentImageIndex]}
                alt={`${property.address} - Image ${currentImageIndex + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTVlN2ViIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzZiNzI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
                }}
              />
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => navigateImage('prev')}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    onClick={() => navigateImage('next')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
                    {currentImageIndex + 1} / {images.length}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="aspect-[16/9] bg-gray-200 rounded-lg flex items-center justify-center">
              <div className="text-center text-gray-500">
                <Home className="h-16 w-16 mx-auto mb-2 opacity-50" />
                <p>No images available</p>
              </div>
            </div>
          )}

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
              {images.slice(0, 8).map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={`flex-shrink-0 w-20 h-14 rounded overflow-hidden border-2 ${
                    idx === currentImageIndex ? 'border-blue-600' : 'border-transparent'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              {images.length > 8 && (
                <div className="flex-shrink-0 w-20 h-14 rounded bg-gray-200 flex items-center justify-center text-gray-600 text-sm">
                  +{images.length - 8} more
                </div>
              )}
            </div>
          )}
        </div>

        {/* Property Header */}
        <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                ${property.price?.toLocaleString() || 'Price TBD'}
              </div>
              <div className="text-lg font-medium text-gray-700">
                {property.address}
              </div>
              <div className="text-gray-600 flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {property.city}, {property.state} {property.zipCode}
              </div>
            </div>
            {fitScore !== undefined && fitScore !== null && (
              <div className="text-right">
                <div className="text-sm text-gray-500 mb-1">Fit for you</div>
                <Badge
                  className={`text-lg px-3 py-1 ${
                    fitScore >= 80
                      ? 'bg-green-100 text-green-800'
                      : fitScore >= 60
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {fitScore}/100
                </Badge>
              </div>
            )}
          </div>

          {/* Property Stats */}
          <div className="flex flex-wrap gap-6 text-gray-700">
            {property.bedrooms && (
              <div className="flex items-center gap-2">
                <Bed className="h-5 w-5 text-gray-400" />
                <span className="font-medium">{property.bedrooms}</span> beds
              </div>
            )}
            {property.bathrooms && (
              <div className="flex items-center gap-2">
                <Bath className="h-5 w-5 text-gray-400" />
                <span className="font-medium">{property.bathrooms}</span> baths
              </div>
            )}
            {property.sqft && (
              <div className="flex items-center gap-2">
                <Square className="h-5 w-5 text-gray-400" />
                <span className="font-medium">{property.sqft.toLocaleString()}</span> sqft
              </div>
            )}
            {property.yearBuilt && (
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-gray-400" />
                Built <span className="font-medium">{property.yearBuilt}</span>
              </div>
            )}
            {property.garageSpaces && (
              <div className="flex items-center gap-2">
                <Car className="h-5 w-5 text-gray-400" />
                <span className="font-medium">{property.garageSpaces}</span> car garage
              </div>
            )}
          </div>
        </div>

        {/* AI Insights */}
        {aiAnalysis && (
          <div className="space-y-6 mb-6">
            {/* Photo Headline */}
            {aiAnalysis.photos?.photo_headline && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-lg font-semibold text-blue-700 mb-2">
                    {aiAnalysis.photos.photo_headline}
                  </h3>
                  {aiAnalysis.photos.photo_summary && (
                    <p className="text-gray-600">{aiAnalysis.photos.photo_summary}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* What's Matching / Missing / Red Flags - using ClientSummaryDeep */}
            {(aiAnalysis.text?.whats_matching?.length || aiAnalysis.text?.whats_missing?.length || aiAnalysis.text?.red_flags?.length) && (
              <ClientSummaryDeep
                analysis={listingForAnalysis.aiAnalysis}
                listing={listingForAnalysis}
                isLoadingPhotos={false}
              />
            )}

            {/* Location Intelligence */}
            {aiAnalysis.location && (locationScore !== undefined || aiAnalysis.location.location_summary) && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Navigation className="h-5 w-5 text-blue-600" />
                      Location Intelligence
                    </h3>
                    {isValidLocationScore && (
                      <Badge className={`${
                        locationScore >= 80 ? 'bg-green-100 text-green-800' :
                        locationScore >= 60 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        Location fit: {Math.round(locationScore)}/100
                      </Badge>
                    )}
                  </div>

                  {aiAnalysis.location.location_summary && (
                    <div className="space-y-3">
                      {/* Commute Info */}
                      {aiAnalysis.location.location_summary.commute && (
                        <div className="flex flex-wrap gap-4 text-sm">
                          {aiAnalysis.location.location_summary.commute.drive_peak_mins && (
                            <div className="bg-gray-50 px-3 py-2 rounded">
                              <span className="text-gray-500">Peak commute:</span>{' '}
                              <span className="font-medium">{aiAnalysis.location.location_summary.commute.drive_peak_mins} min</span>
                            </div>
                          )}
                          {aiAnalysis.location.location_summary.commute.drive_offpeak_mins && (
                            <div className="bg-gray-50 px-3 py-2 rounded">
                              <span className="text-gray-500">Off-peak:</span>{' '}
                              <span className="font-medium">{aiAnalysis.location.location_summary.commute.drive_offpeak_mins} min</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Amenities */}
                      {aiAnalysis.location.location_summary.amenities && (
                        <div className="flex flex-wrap gap-4 text-sm">
                          {aiAnalysis.location.location_summary.amenities.grocery_drive_mins && (
                            <div className="bg-blue-50 px-3 py-2 rounded">
                              Grocery: <span className="font-medium">{aiAnalysis.location.location_summary.amenities.grocery_drive_mins} min</span>
                            </div>
                          )}
                          {aiAnalysis.location.location_summary.amenities.pharmacy_drive_mins && (
                            <div className="bg-blue-50 px-3 py-2 rounded">
                              Pharmacy: <span className="font-medium">{aiAnalysis.location.location_summary.amenities.pharmacy_drive_mins} min</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Location Flags - cap at 4 to avoid UI clutter */}
                  {aiAnalysis.location.location_flags && aiAnalysis.location.location_flags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {aiAnalysis.location.location_flags.slice(0, 4).map((flag: any, idx: number) => {
                        const flagType = getFlagType(flag.level);
                        const label = getFriendlyLabel(flag);

                        return (
                          <Badge
                            key={idx}
                            variant="outline"
                            className={
                              flagType === 'positive' ? 'border-green-300 text-green-700 bg-green-50' :
                              flagType === 'warning' ? 'border-yellow-300 text-yellow-700 bg-yellow-50' :
                              'border-gray-300 text-gray-700'
                            }
                          >
                            {flagType === 'positive' && <CheckCircle className="h-3 w-3 mr-1" />}
                            {flagType === 'warning' && <AlertTriangle className="h-3 w-3 mr-1" />}
                            {label}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* No AI Analysis Available */}
        {!aiAnalysis && (
          <Card className="mb-6">
            <CardContent className="pt-6 text-center text-gray-500">
              <p>AI insights are not available for this property yet.</p>
              <p className="text-sm mt-1">Ask your agent if you'd like more details.</p>
            </CardContent>
          </Card>
        )}

        {/* Property Description */}
        {property.description && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-3">Property Description</h3>
              <p className="text-gray-700 whitespace-pre-line">{property.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Contact Agent */}
        <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4">Contact Your Agent</h3>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1">
                <p className="font-medium text-gray-900 text-lg">{agent.name || 'Your Agent'}</p>
              </div>
              <div className="flex gap-2">
                {agent.phone && (
                  <Button asChild>
                    <a href={`tel:${agent.phone}`}>
                      <Phone className="h-4 w-4 mr-2" />
                      Call
                    </a>
                  </Button>
                )}
                {agent.email && (
                  <Button asChild variant="outline">
                    <a href={`mailto:${agent.email}?subject=${emailSubject}`}>
                      <Mail className="h-4 w-4 mr-2" />
                      Email
                    </a>
                  </Button>
                )}
                {/* Fallback when no contact info available */}
                {!agent.phone && !agent.email && (
                  <p className="text-sm text-muted-foreground">
                    Contact details aren't available here. Please reach out through your usual channel.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Back to Report */}
        <div className="text-center pb-8">
          <Button asChild variant="outline" size="lg">
            <a href={reportUrl}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Full Report
            </a>
          </Button>
        </div>
      </main>
    </div>
  );
}

export default SharedPropertyDetail;

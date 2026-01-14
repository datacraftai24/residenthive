import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bed, Bath, Maximize, MapPin, Calendar, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Info, Camera, MessageCircle, Car, Clock, ShoppingCart, TreePine, Volume2, Flag, GraduationCap, Train, Coffee, Users, CircleDot } from "lucide-react";
import { useState, useEffect } from "react";
import { PropertyNotes } from "./PropertyNotes";

interface WhatsMatchingItem {
  requirement: string;
  evidence: string;
  source: string;
}

interface WhatsMissingItem {
  requirement: string;
  assessment?: string;
  workaround?: string;
  // Legacy support
  concern?: string;
  severity?: string;
}

interface RedFlagItem {
  concern: string;
  quote?: string;
  risk_level: string;
  follow_up?: string;
}

interface PhotoMatchItem {
  requirement: string;
  visible: boolean;
  confidence?: string;
  notes?: string;
}

interface PhotoRedFlagItem {
  concern: string;
  severity?: string;
  location?: string;
}

interface AIAnalysis {
  headline?: string;
  why_its_a_fit?: string;
  summary_for_buyer?: string;
  whats_matching?: WhatsMatchingItem[];
  whats_missing?: WhatsMissingItem[];
  red_flags?: RedFlagItem[];
  photo_headline?: string;
  photo_summary?: string;
  photo_matches?: PhotoMatchItem[];
  photo_red_flags?: PhotoRedFlagItem[];
}

interface LocationCommute {
  drive_peak_mins?: number;
  drive_offpeak_mins?: number;
  distance_miles?: number;
}

interface LocationStreetContext {
  street_type?: string;
  traffic_level?: string;
  noise_risk?: string;
}

interface LocationAmenities {
  grocery_drive_mins?: number;
  pharmacy_drive_mins?: number;
}

interface LocationWalkability {
  sidewalks_present?: boolean;
  closest_park_walk_mins?: number;
}

interface LocationFlag {
  level: 'green' | 'yellow' | 'red';
  code: string;
  message: string;
  category?: string;
}

interface LocationSummary {
  commute?: LocationCommute;
  street_context?: LocationStreetContext;
  amenities?: LocationAmenities;
  walkability?: LocationWalkability;
  flags?: LocationFlag[];
}

interface Listing {
  mlsNumber: string;
  address: string;
  city: string;
  state?: string;
  zip_code?: string;
  listPrice: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  images?: string[];
  remarks?: string;
  location_summary?: LocationSummary;
  aiAnalysis?: AIAnalysis;
  // Additional MLS fields
  yearBuilt?: number;
  lotSize?: number;
  garageSpaces?: number;
  daysOnMarket?: number;
  propertyType?: string;
}

interface PropertyNote {
  listingId: string;
  noteText?: string;
  updatedAt?: string;
}

interface PropertyDetailModalProps {
  listing: Listing | null;
  rank: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduleShowing: () => void;
  shareId?: string;
  propertyNotes?: PropertyNote[];
}

export function PropertyDetailModal({
  listing,
  rank,
  open,
  onOpenChange,
  onScheduleShowing,
  shareId,
  propertyNotes = []
}: PropertyDetailModalProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const images = listing?.images || [];
  const aiAnalysis = listing?.aiAnalysis;
  // Location summary can be at locationSummary OR listing.aiAnalysis.location_summary
  const locationSummary = listing?.location_summary || aiAnalysis?.location_summary;

  // Get initial note for this property if available
  const initialNote = listing?.mlsNumber
    ? propertyNotes.find(n => n.listingId === listing.mlsNumber)?.noteText || ""
    : "";

  // Reset image index when modal opens with different listing
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setImageIndex(0);
    }
    onOpenChange(newOpen);
  };

  if (!listing) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Badge className={rank === 1 ? "bg-green-600" : rank === 2 ? "bg-blue-600" : "bg-gray-600"}>
              #{rank} {rank === 1 ? "TOP PICK" : rank === 2 ? "ALTERNATIVE" : "OPTION"}
            </Badge>
            <span className="truncate">{listing.address}, {listing.city}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Image Gallery */}
        <div className="relative h-64 rounded-lg overflow-hidden bg-gray-100">
          {images.length > 0 ? (
            <>
              <img
                src={images[imageIndex]}
                alt={`${listing.address} - Image ${imageIndex + 1}`}
                className="w-full h-full object-cover"
              />
              {images.length > 1 && (
                <>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageIndex(i => i > 0 ? i - 1 : images.length - 1);
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageIndex(i => i < images.length - 1 ? i + 1 : 0);
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <div className="absolute bottom-2 right-2 bg-black/60 text-white px-2 py-1 rounded text-sm">
                    {imageIndex + 1} / {images.length}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              No images available
            </div>
          )}
        </div>

        {/* Key Stats */}
        <div className="flex items-center justify-between py-4 border-b">
          <div className="text-2xl font-bold">${listing.listPrice?.toLocaleString()}</div>
          <div className="flex items-center gap-4 text-gray-600">
            <span className="flex items-center gap-1">
              <Bed className="h-4 w-4" /> {listing.bedrooms} beds
            </span>
            <span className="flex items-center gap-1">
              <Bath className="h-4 w-4" /> {listing.bathrooms} baths
            </span>
            <span className="flex items-center gap-1">
              <Maximize className="h-4 w-4" /> {listing.sqft?.toLocaleString()} sqft
            </span>
          </div>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="analysis" className="mt-4">
          <TabsList>
            <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
            <TabsTrigger value="details">Property Details</TabsTrigger>
            <TabsTrigger value="location">Location</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="mt-4 space-y-5">
            {/* Headline */}
            {aiAnalysis?.headline && (
              <div className="text-lg font-semibold text-gray-900">{aiAnalysis.headline}</div>
            )}

            {/* My Take - Agent's summary (moved to top for prominence) */}
            {(aiAnalysis?.summary_for_buyer || aiAnalysis?.why_its_a_fit) && (
              <div className="border-l-4 border-purple-500 bg-purple-50 pl-4 py-3 pr-4 rounded-r-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-purple-800">My take:</span>
                </div>
                <p className="text-gray-700 italic">
                  {aiAnalysis.summary_for_buyer || aiAnalysis.why_its_a_fit}
                </p>
              </div>
            )}

            {/* Why This Could Be a Good Match */}
            {aiAnalysis?.whats_matching && aiAnalysis.whats_matching.length > 0 && (
              <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-800">Why This Could Be a Good Match</span>
                </div>
                <div className="space-y-3">
                  {aiAnalysis.whats_matching.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-gray-900">{item.requirement}</span>
                        {item.evidence && (
                          <p className="text-sm text-green-700 mt-0.5">{item.evidence}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* What You Should Know - Red flags (listing concerns) */}
            {aiAnalysis?.red_flags && aiAnalysis.red_flags.length > 0 && (
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <span className="font-semibold text-amber-800">Concerns to Consider</span>
                </div>
                <div className="space-y-3">
                  {aiAnalysis.red_flags.map((item, i) => (
                    <div key={`flag-${i}`} className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-gray-900">{item.concern}</span>
                        {item.quote && (
                          <p className="text-sm text-amber-700 mt-0.5 italic">"{item.quote}"</p>
                        )}
                        {item.follow_up && (
                          <p className="text-sm text-amber-600 mt-1">Follow up: {item.follow_up}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing Requirements */}
            {aiAnalysis?.whats_missing && aiAnalysis.whats_missing.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="h-5 w-5 text-gray-600" />
                  <span className="font-semibold text-gray-700">Missing From Your Requirements</span>
                </div>
                <div className="space-y-3">
                  {aiAnalysis.whats_missing.map((item, i) => (
                    <div key={`missing-${i}`} className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-gray-900">{item.requirement || item.concern}</span>
                        {item.assessment && (
                          <p className="text-sm text-gray-600 mt-0.5">{item.assessment}</p>
                        )}
                        {item.workaround && (
                          <p className="text-sm text-blue-600 mt-1">
                            <span className="font-medium">Workaround:</span> {item.workaround}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Photo Analysis - What We Saw in Photos */}
            {(aiAnalysis?.photo_headline || aiAnalysis?.photo_matches?.length || aiAnalysis?.photo_red_flags?.length) && (
              <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                <div className="flex items-center gap-2 mb-3">
                  <Camera className="h-5 w-5 text-indigo-600" />
                  <span className="font-semibold text-indigo-800">What We Saw in Photos</span>
                </div>

                {/* Headline and Summary */}
                {aiAnalysis?.photo_headline && (
                  <p className="font-medium text-indigo-900 mb-2">{aiAnalysis.photo_headline}</p>
                )}
                {aiAnalysis?.photo_summary && (
                  <p className="text-sm text-indigo-700 mb-3">{aiAnalysis.photo_summary}</p>
                )}

                {/* Photo Matches - Requirements visible in photos */}
                {aiAnalysis?.photo_matches && aiAnalysis.photo_matches.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {aiAnalysis.photo_matches.map((item, i) => (
                      <div key={`photo-match-${i}`} className="flex items-start gap-2">
                        {item.visible ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        ) : (
                          <Info className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        )}
                        <div>
                          <span className={item.visible ? "text-gray-900" : "text-gray-500"}>
                            {item.requirement}
                          </span>
                          {!item.visible && (
                            <span className="text-xs text-gray-400 ml-1">(not visible in photos)</span>
                          )}
                          {item.notes && (
                            <p className="text-xs text-indigo-600 mt-0.5">{item.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Photo Red Flags - Visual concerns */}
                {aiAnalysis?.photo_red_flags && aiAnalysis.photo_red_flags.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-indigo-200">
                    <span className="text-xs font-medium text-amber-700 uppercase tracking-wide">Visual Concerns</span>
                    <div className="mt-2 space-y-2">
                      {aiAnalysis.photo_red_flags.map((item, i) => (
                        <div key={`photo-flag-${i}`} className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="text-gray-900">{item.concern}</span>
                            {item.location && (
                              <span className="text-xs text-gray-500 ml-1">({item.location})</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* No analysis fallback */}
            {!aiAnalysis?.headline && !aiAnalysis?.whats_matching?.length && !aiAnalysis?.summary_for_buyer && (
              <p className="text-gray-500">No AI analysis available for this property.</p>
            )}
          </TabsContent>

          <TabsContent value="details" className="mt-4 space-y-6">
            {/* Chatbot Prompt */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-800">
                Have questions about this property? Use the chat button to ask our AI assistant.
              </p>
            </div>

            {/* Property Specs Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Bedrooms</div>
                <div className="text-lg font-semibold text-gray-900">{listing.bedrooms || '—'}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Bathrooms</div>
                <div className="text-lg font-semibold text-gray-900">{listing.bathrooms || '—'}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Square Feet</div>
                <div className="text-lg font-semibold text-gray-900">{listing.sqft?.toLocaleString() || '—'}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Price/sqft</div>
                <div className="text-lg font-semibold text-gray-900">
                  {listing.sqft ? `$${Math.round(listing.listPrice / listing.sqft).toLocaleString()}` : '—'}
                </div>
              </div>
              {listing.yearBuilt && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Year Built</div>
                  <div className="text-lg font-semibold text-gray-900">{listing.yearBuilt}</div>
                </div>
              )}
              {listing.lotSize && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Lot Size</div>
                  <div className="text-lg font-semibold text-gray-900">{listing.lotSize.toLocaleString()} sqft</div>
                </div>
              )}
              {listing.garageSpaces && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Garage</div>
                  <div className="text-lg font-semibold text-gray-900">{listing.garageSpaces} car</div>
                </div>
              )}
              {listing.daysOnMarket !== undefined && listing.daysOnMarket !== null && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Days on Market</div>
                  <div className="text-lg font-semibold text-gray-900">{listing.daysOnMarket}</div>
                </div>
              )}
            </div>

            {/* Property Description */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Description</h4>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {listing.remarks || "No description available."}
              </p>
            </div>

            {/* MLS Info */}
            <div className="text-sm text-gray-500 border-t pt-4">
              MLS# {listing.mlsNumber}
            </div>
          </TabsContent>

          <TabsContent value="location" className="mt-4 space-y-4">
            {/* Address */}
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="h-4 w-4" />
              {listing.address}, {listing.city}
              {listing.state && `, ${listing.state}`}
              {listing.zip_code && ` ${listing.zip_code}`}
            </div>

            {/* Location Flags - Show first as they're most important */}
            {locationSummary?.flags && locationSummary.flags.length > 0 && (
              <div className="space-y-2">
                {locationSummary.flags.map((flag, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 p-3 rounded-lg border ${
                      flag.level === 'green' ? 'bg-green-50 border-green-200' :
                      flag.level === 'yellow' ? 'bg-amber-50 border-amber-200' :
                      'bg-red-50 border-red-200'
                    }`}
                  >
                    {flag.level === 'green' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    ) : flag.level === 'yellow' ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Flag className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    )}
                    <div>
                      <span className={`text-sm font-medium ${
                        flag.level === 'green' ? 'text-green-800' :
                        flag.level === 'yellow' ? 'text-amber-800' :
                        'text-red-800'
                      }`}>
                        {flag.message}
                      </span>
                      {flag.category && (
                        <span className="text-xs text-gray-500 ml-2">({flag.category})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Commute & Distance */}
            {locationSummary?.commute && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Car className="h-5 w-5 text-gray-600" />
                  <h4 className="font-semibold text-gray-900">Commute</h4>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {locationSummary.commute.drive_peak_mins !== undefined && (
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Peak Traffic</div>
                      <div className="text-lg font-medium text-gray-900">
                        {locationSummary.commute.drive_peak_mins} min
                      </div>
                    </div>
                  )}
                  {locationSummary.commute.drive_offpeak_mins !== undefined && (
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Off-Peak</div>
                      <div className="text-lg font-medium text-gray-900">
                        {locationSummary.commute.drive_offpeak_mins} min
                      </div>
                    </div>
                  )}
                  {locationSummary.commute.distance_miles !== undefined && (
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Distance</div>
                      <div className="text-lg font-medium text-gray-900">
                        {locationSummary.commute.distance_miles} mi
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Street Context & Amenities */}
            {(locationSummary?.street_context || locationSummary?.amenities || locationSummary?.walkability) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Street Context */}
                {locationSummary?.street_context && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Volume2 className="h-4 w-4 text-gray-600" />
                      <h4 className="font-semibold text-gray-900 text-sm">Street Context</h4>
                    </div>
                    <div className="space-y-1 text-sm">
                      {locationSummary.street_context.street_type && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Street Type</span>
                          <span className="font-medium capitalize">{locationSummary.street_context.street_type.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      {locationSummary.street_context.is_cul_de_sac && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Cul-de-sac</span>
                          <span className="font-medium text-green-600">Yes</span>
                        </div>
                      )}
                      {locationSummary.street_context.traffic_level && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Traffic</span>
                          <span className="font-medium capitalize">{locationSummary.street_context.traffic_level}</span>
                        </div>
                      )}
                      {locationSummary.street_context.noise_risk && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Noise Risk</span>
                          <span className="font-medium capitalize">{locationSummary.street_context.noise_risk}</span>
                        </div>
                      )}
                      {locationSummary.street_context.near_major_road_meters !== undefined && locationSummary.street_context.near_major_road_meters !== null && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Major Road</span>
                          <span className="font-medium">{Math.round(locationSummary.street_context.near_major_road_meters * 3.28)} ft away</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Nearby Amenities */}
                {locationSummary?.amenities && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <ShoppingCart className="h-4 w-4 text-gray-600" />
                      <h4 className="font-semibold text-gray-900 text-sm">Nearby Amenities</h4>
                    </div>
                    <div className="space-y-1 text-sm">
                      {locationSummary.amenities.grocery_drive_mins !== undefined && locationSummary.amenities.grocery_drive_mins !== null && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Grocery Store</span>
                          <span className="font-medium">{locationSummary.amenities.grocery_drive_mins} min drive</span>
                        </div>
                      )}
                      {locationSummary.amenities.pharmacy_drive_mins !== undefined && locationSummary.amenities.pharmacy_drive_mins !== null && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Pharmacy</span>
                          <span className="font-medium">{locationSummary.amenities.pharmacy_drive_mins} min drive</span>
                        </div>
                      )}
                      {locationSummary.amenities.cafes_drive_mins !== undefined && locationSummary.amenities.cafes_drive_mins !== null && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Cafes/Restaurants</span>
                          <span className="font-medium">{locationSummary.amenities.cafes_drive_mins} min drive</span>
                        </div>
                      )}
                      {locationSummary.amenities.train_station_drive_mins !== undefined && locationSummary.amenities.train_station_drive_mins !== null && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Train Station</span>
                          <span className="font-medium">{locationSummary.amenities.train_station_drive_mins} min drive</span>
                        </div>
                      )}
                      {locationSummary.amenities.primary_school_drive_mins !== undefined && locationSummary.amenities.primary_school_drive_mins !== null && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Primary School</span>
                          <span className="font-medium">{locationSummary.amenities.primary_school_drive_mins} min drive</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Walkability */}
                {locationSummary?.walkability && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <TreePine className="h-4 w-4 text-gray-600" />
                      <h4 className="font-semibold text-gray-900 text-sm">Walkability</h4>
                      {locationSummary.walkability.walk_score_estimate !== undefined && locationSummary.walkability.walk_score_estimate !== null && (
                        <Badge variant="secondary" className="ml-auto text-xs">
                          Score: {locationSummary.walkability.walk_score_estimate}/100
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1 text-sm">
                      {locationSummary.walkability.overall_walkability_label && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Rating</span>
                          <span className="font-medium capitalize">{locationSummary.walkability.overall_walkability_label.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      {locationSummary.walkability.sidewalks_present !== undefined && locationSummary.walkability.sidewalks_present !== null && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Sidewalks</span>
                          <span className="font-medium">{locationSummary.walkability.sidewalks_present ? 'Yes' : 'No'}</span>
                        </div>
                      )}
                      {locationSummary.walkability.closest_park_walk_mins !== undefined && locationSummary.walkability.closest_park_walk_mins !== null && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Nearest Park</span>
                          <span className="font-medium">{locationSummary.walkability.closest_park_walk_mins} min walk</span>
                        </div>
                      )}
                      {locationSummary.walkability.closest_playground_walk_mins !== undefined && locationSummary.walkability.closest_playground_walk_mins !== null && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Nearest Playground</span>
                          <span className="font-medium">{locationSummary.walkability.closest_playground_walk_mins} min walk</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Family Indicators */}
            {locationSummary?.family_indicators && (
              (locationSummary.family_indicators.nearby_playgrounds_count > 0 ||
               locationSummary.family_indicators.nearby_parks_count > 0 ||
               locationSummary.family_indicators.nearby_schools_count > 0) && (
                <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-5 w-5 text-green-600" />
                    <h4 className="font-semibold text-green-900">Family Friendly</h4>
                    <span className="text-xs text-green-600 ml-auto">Within 1 mile</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-700">
                        {locationSummary.family_indicators.nearby_playgrounds_count}
                      </div>
                      <div className="text-xs text-green-600">Playgrounds</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-700">
                        {locationSummary.family_indicators.nearby_parks_count}
                      </div>
                      <div className="text-xs text-green-600">Parks</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-700">
                        {locationSummary.family_indicators.nearby_schools_count}
                      </div>
                      <div className="text-xs text-green-600">Schools</div>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* No location data fallback */}
            {!locationSummary && (
              <div className="bg-gray-50 p-4 rounded-lg text-gray-500 text-center">
                No detailed location analysis available for this property.
              </div>
            )}

            {/* Chatbot Prompt for Location Questions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-800">
                Want to know about commute times, schools, or the neighborhood? Ask our AI assistant.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Property Notes */}
        {shareId && listing?.mlsNumber && (
          <div className="mt-4">
            <PropertyNotes
              shareId={shareId}
              listingId={listing.mlsNumber}
              initialNote={initialNote}
            />
          </div>
        )}

        {/* Action */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onScheduleShowing}>
            <Calendar className="h-4 w-4 mr-2" /> Schedule Showing
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

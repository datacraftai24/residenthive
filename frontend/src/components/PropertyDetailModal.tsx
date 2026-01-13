import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bed, Bath, Maximize, MapPin, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

interface WhatsMatchingItem {
  requirement: string;
  evidence: string;
  source: string;
}

interface WhatsMissingItem {
  concern: string;
  severity: string;
  workaround?: string;
}

interface RedFlagItem {
  concern: string;
  quote?: string;
  risk_level: string;
  follow_up?: string;
}

interface AIAnalysis {
  headline?: string;
  why_its_a_fit?: string;
  whats_matching?: WhatsMatchingItem[];
  whats_missing?: WhatsMissingItem[];
  red_flags?: RedFlagItem[];
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
  location_summary?: string;
  aiAnalysis?: AIAnalysis;
}

interface PropertyDetailModalProps {
  listing: Listing | null;
  rank: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduleShowing: () => void;
}

export function PropertyDetailModal({
  listing,
  rank,
  open,
  onOpenChange,
  onScheduleShowing
}: PropertyDetailModalProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const images = listing?.images || [];
  const aiAnalysis = listing?.aiAnalysis;

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

          <TabsContent value="analysis" className="mt-4 space-y-4">
            {aiAnalysis?.headline && (
              <div className="text-lg font-medium text-green-700">{aiAnalysis.headline}</div>
            )}
            {aiAnalysis?.why_its_a_fit && (
              <div>
                <strong>Why it fits:</strong> {aiAnalysis.why_its_a_fit}
              </div>
            )}
            {aiAnalysis?.whats_matching && aiAnalysis.whats_matching.length > 0 && (
              <div>
                <strong>What's matching:</strong>
                <ul className="mt-1 list-disc list-inside text-gray-700">
                  {aiAnalysis.whats_matching.map((item, i) => (
                    <li key={i}>{item.requirement}: {item.evidence}</li>
                  ))}
                </ul>
              </div>
            )}
            {aiAnalysis?.whats_missing && aiAnalysis.whats_missing.length > 0 && (
              <div>
                <strong>What's missing:</strong>
                <ul className="mt-1 list-disc list-inside text-gray-600">
                  {aiAnalysis.whats_missing.map((item, i) => (
                    <li key={i}>{item.concern}{item.workaround && ` (${item.workaround})`}</li>
                  ))}
                </ul>
              </div>
            )}
            {aiAnalysis?.red_flags && aiAnalysis.red_flags.length > 0 && (
              <div className="text-amber-600">
                <strong>Concerns:</strong>
                <ul className="mt-1 list-disc list-inside">
                  {aiAnalysis.red_flags.map((item, i) => (
                    <li key={i}>{item.concern}</li>
                  ))}
                </ul>
              </div>
            )}
            {!aiAnalysis?.headline && !aiAnalysis?.why_its_a_fit && (
              <p className="text-gray-500">No AI analysis available for this property.</p>
            )}
          </TabsContent>

          <TabsContent value="details" className="mt-4">
            <p className="text-gray-700 whitespace-pre-wrap">
              {listing.remarks || "No description available."}
            </p>
          </TabsContent>

          <TabsContent value="location" className="mt-4">
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="h-4 w-4" />
              {listing.address}, {listing.city}
              {listing.state && `, ${listing.state}`}
              {listing.zip_code && ` ${listing.zip_code}`}
            </div>
            {listing.location_summary && (
              <p className="mt-2 text-gray-700">{listing.location_summary}</p>
            )}
          </TabsContent>
        </Tabs>

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

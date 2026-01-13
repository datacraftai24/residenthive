import React, { useState } from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChatWidget } from '@/components/ChatWidget';
import { PropertyCard } from '@/components/PropertyCard';
import { PropertyDetailModal } from '@/components/PropertyDetailModal';
import { ComparisonTable } from '@/components/ComparisonTable';
import { AIInsightsPanel } from '@/components/AIInsightsPanel';
import { FloatingChatButton } from '@/components/FloatingChatButton';
import { Home, Mail, Phone, Loader2, Scale } from 'lucide-react';

interface RankedPick {
  mlsNumber: string;
  label: string;
  why: string;
}

interface RequirementsFlags {
  [key: string]: string;
}

interface RequirementsTableEntry {
  mlsNumber: string;
  flags: RequirementsFlags;
}

interface DisplayRequirements {
  criteria: string[];
  labels: { [key: string]: string };
  table: RequirementsTableEntry[];
  condition_notes: { [key: string]: string };
  hidden_count: number;
}

interface ComparisonRow {
  id: string;
  label: string;
  icon: string;
  type: string;
  values: Record<string, {
    value: number | string;
    display: string;
    subtext?: string;
    flag?: string;
    is_best?: boolean;
  }>;
}

interface ListingHeader {
  mlsNumber: string;
  address: string;
  city: string;
  image: string | null;
  rank: number;
  label: string;
}

interface RichComparison {
  rows: ComparisonRow[];
  listings: ListingHeader[];
}

interface CategoryWinners {
  best_overall?: string | null;
  best_yard?: string | null;
  shortest_commute?: string | null;
  best_parking?: string | null;
  quietest_location?: string | null;
  most_budget_room?: string | null;
}

interface LeadContext {
  leadId: number;
  source: string;
  leadType: string;
  propertyAddress?: string | null;
  propertyListPrice?: number | null;
  propertyBedrooms?: number | null;
  propertyBathrooms?: string | null;
  propertySqft?: number | null;
  propertyImageUrl?: string | null;
  propertyListingId?: string | null;
  originalMessage?: string | null;
  timeline?: string | null;
}

interface Synthesis {
  intro_paragraph: string;
  ranked_picks: RankedPick[];
  next_steps: string;
  requirements_table?: RequirementsTableEntry[];
  display_requirements?: DisplayRequirements;
  category_winners?: CategoryWinners;
  lead_context?: LeadContext;
  rich_comparison?: RichComparison;
}

interface Listing {
  mlsNumber: string;
  address: string;
  city: string;
  state?: string;
  zip?: string;
  zip_code?: string;
  listPrice: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  images?: string[];
  remarks?: string;
  location_summary?: string;
  propertyUrl?: string;
  fitScore?: number;
  aiAnalysis?: {
    headline?: string;
    why_its_a_fit?: string;
    whats_matching?: string[];
    whats_missing?: string[];
    red_flags?: string[];
    photo_headline?: string;
    photo_summary?: string;
  };
}

interface BuyerReportData {
  shareId: string;
  buyerName: string;
  agentName: string;
  agentEmail?: string;
  agentPhone?: string;
  location: string;
  createdAt: string;
  listings: Listing[];
  synthesis?: Synthesis;
  profileId?: number;
  agentId?: number;
  leadContext?: {
    leadId?: number;
    leadType?: string;
    propertyAddress?: string;
    propertyListPrice?: number;
    source?: string;
  };
}

export function BuyerReportPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

  const { data: report, isLoading, error } = useQuery<BuyerReportData>({
    queryKey: ['buyer-report', shareId],
    queryFn: async () => {
      const response = await fetch(`/api/buyer-reports/${shareId}`);
      if (!response.ok) {
        throw new Error('Report not found');
      }
      return response.json();
    },
    enabled: !!shareId,
  });

  // Helper to open chat with pre-filled showing request
  const requestShowing = (mlsNumber: string) => {
    const listing = report?.listings.find(l => l.mlsNumber === mlsNumber);
    if (listing) {
      window.dispatchEvent(new CustomEvent('request-showing', {
        detail: { address: listing.address }
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your property report...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Report Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              This property report could not be found. Please check the link and try again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Property Recommendations for {report.buyerName}
              </h1>
              <p className="text-gray-600">
                Curated by {report.agentName}
              </p>
              {report.location && (
                <p className="text-sm text-gray-500 mt-1">
                  {report.location}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {report.agentEmail && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`mailto:${report.agentEmail}`, '_blank')}
                  className="flex items-center gap-2"
                >
                  <Mail className="h-4 w-4" />
                  Email Agent
                </Button>
              )}
              {report.agentPhone && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`tel:${report.agentPhone}`, '_blank')}
                  className="flex items-center gap-2"
                >
                  <Phone className="h-4 w-4" />
                  Call Agent
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {report.listings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Home className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                No Properties Yet
              </h2>
              <p className="text-gray-600">
                Your agent is currently preparing property recommendations for you.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Lead Context Card - Show original property interest */}
            {report.synthesis?.lead_context?.propertyAddress && (
              <Card className="mb-6 border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
                <CardContent className="p-4">
                  <div className="flex gap-4 items-start">
                    {report.synthesis.lead_context.propertyImageUrl && (
                      <div className="w-24 h-20 rounded-lg overflow-hidden flex-shrink-0">
                        <img
                          src={report.synthesis.lead_context.propertyImageUrl}
                          alt="Original Property"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Home className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-700">
                          Your Original Interest
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          From {report.synthesis.lead_context.source.charAt(0).toUpperCase() + report.synthesis.lead_context.source.slice(1)}
                        </Badge>
                      </div>
                      <p className="font-medium text-gray-900">
                        {report.synthesis.lead_context.propertyAddress}
                      </p>
                      <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-600">
                        {report.synthesis.lead_context.propertyListPrice && (
                          <span className="font-semibold text-green-700">
                            ${report.synthesis.lead_context.propertyListPrice.toLocaleString()}
                          </span>
                        )}
                        {report.synthesis.lead_context.propertyBedrooms && (
                          <span>{report.synthesis.lead_context.propertyBedrooms} beds</span>
                        )}
                        {report.synthesis.lead_context.propertyBathrooms && (
                          <span>{report.synthesis.lead_context.propertyBathrooms} baths</span>
                        )}
                        {report.synthesis.lead_context.propertySqft && (
                          <span>{report.synthesis.lead_context.propertySqft.toLocaleString()} sqft</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Property Grid - Visual First */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Your Property Matches
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {report.listings.slice(0, 8).map((listing, idx) => (
                  <PropertyCard
                    key={listing.mlsNumber}
                    listing={listing}
                    rank={idx + 1}
                    onViewDetails={() => setSelectedListing(listing)}
                  />
                ))}
              </div>
            </section>

            {/* AI Insights - Collapsible */}
            {report.synthesis && (
              <section className="mb-8">
                <AIInsightsPanel synthesis={report.synthesis} />
              </section>
            )}

            {/* Rich Comparison Table */}
            {report.synthesis?.rich_comparison && report.synthesis.rich_comparison.rows.length > 0 && (
              <section className="mb-8">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Scale className="h-5 w-5" />
                      Compare Properties
                    </CardTitle>
                    <p className="text-sm text-gray-500">
                      Side-by-side comparison based on what matters to you
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ComparisonTable
                      comparison={report.synthesis.rich_comparison}
                      onRequestShowing={requestShowing}
                      onViewDetails={(mlsNumber) => {
                        const listing = report.listings.find(l => l.mlsNumber === mlsNumber);
                        if (listing) setSelectedListing(listing);
                      }}
                    />
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Next Steps CTA */}
            {report.synthesis?.next_steps && (
              <Card className="mb-8 bg-blue-600 text-white">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-2">Next Steps</h3>
                  <p>{report.synthesis.next_steps}</p>
                </CardContent>
              </Card>
            )}

            {/* Footer CTA */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-6 text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Interested in Seeing Any of These Homes?
                </h3>
                <p className="text-gray-600 mb-4">
                  Let me know which properties you'd like to schedule showings for.
                </p>
                <div className="flex items-center justify-center gap-3">
                  {report.agentEmail && (
                    <Button
                      onClick={() => window.open(`mailto:${report.agentEmail}?subject=Property Showings - ${report.buyerName}`, '_blank')}
                      size="lg"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Email {report.agentName}
                    </Button>
                  )}
                  {report.agentPhone && (
                    <Button
                      variant="outline"
                      onClick={() => window.open(`tel:${report.agentPhone}`, '_blank')}
                      size="lg"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      Call {report.agentName}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Property Detail Modal */}
      <PropertyDetailModal
        listing={selectedListing}
        rank={selectedListing ? report.listings.findIndex(l => l.mlsNumber === selectedListing.mlsNumber) + 1 : 0}
        open={!!selectedListing}
        onOpenChange={(open) => !open && setSelectedListing(null)}
        onScheduleShowing={() => {
          if (selectedListing) {
            requestShowing(selectedListing.mlsNumber);
            setSelectedListing(null);
          }
        }}
      />

      {/* Floating Chat Button */}
      <FloatingChatButton>
        <ChatWidget
          shareId={shareId || ''}
          listings={report.listings}
          buyerName={report.buyerName}
          agentName={report.agentName}
          agentEmail={report.agentEmail}
          agentPhone={report.agentPhone}
          profileId={report.profileId}
          agentId={report.agentId}
          leadContext={report.leadContext}
        />
      </FloatingChatButton>
    </div>
  );
}

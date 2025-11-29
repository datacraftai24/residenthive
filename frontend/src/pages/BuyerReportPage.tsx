import React from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClientSummaryDeep } from '@/components/ClientSummaryDeep';
import { Home, Mail, Phone, Loader2, Star, Trophy, Maximize2, Trees, DollarSign } from 'lucide-react';

interface RankedPick {
  mlsNumber: string;
  label: string;
  why: string;
}

interface RequirementsFlags {
  meets_bedrooms: string;
  within_budget: string;
  in_target_area: string;
  has_amenities: string;
  good_condition: string;
  outdoor_space: string;
  good_layout: string;
  low_noise: string;
}

interface RequirementsTableEntry {
  mlsNumber: string;
  flags: RequirementsFlags;
}

interface CategoryWinners {
  best_overall: string | null;
  most_space: string | null;
  best_yard: string | null;
  most_budget_room: string | null;
}

interface Synthesis {
  intro_paragraph: string;
  ranked_picks: RankedPick[];
  next_steps: string;
  requirements_table?: RequirementsTableEntry[];
  category_winners?: CategoryWinners;
}

interface BuyerReportData {
  shareId: string;
  buyerName: string;
  agentName: string;
  agentEmail?: string;
  agentPhone?: string;
  location: string;
  createdAt: string;
  listings: any[];
  synthesis?: Synthesis;
}

export function BuyerReportPage() {
  const { shareId } = useParams<{ shareId: string }>();

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
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
      <div className="max-w-6xl mx-auto px-4 py-8">
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
            {/* LLM Synthesis Section */}
            {report.synthesis && (
              <Card className="mb-8 bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-blue-600" />
                    My Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Intro Paragraph */}
                  <div className="bg-white rounded-lg p-4 border border-blue-100">
                    <p className="text-gray-700 leading-relaxed">
                      {report.synthesis.intro_paragraph}
                    </p>
                  </div>

                  {/* Category Winners */}
                  {report.synthesis.category_winners && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-gray-900">Category Highlights:</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {report.synthesis.category_winners.best_overall && (() => {
                          const listing = report.listings.find(l => l.mlsNumber === report.synthesis!.category_winners!.best_overall);
                          return listing ? (
                            <div key="best_overall" className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg p-4 border border-yellow-200">
                              <div className="flex items-center gap-2 mb-2">
                                <Trophy className="h-5 w-5 text-yellow-600" />
                                <span className="font-semibold text-gray-900">Best Overall Match</span>
                              </div>
                              <p className="text-sm text-gray-700 font-medium">{listing.address}</p>
                              {listing.aiAnalysis?.headline && (
                                <p className="text-xs text-gray-600 mt-1">{listing.aiAnalysis.headline}</p>
                              )}
                            </div>
                          ) : null;
                        })()}

                        {report.synthesis.category_winners.most_space && (() => {
                          const listing = report.listings.find(l => l.mlsNumber === report.synthesis!.category_winners!.most_space);
                          return listing ? (
                            <div key="most_space" className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-4 border border-blue-200">
                              <div className="flex items-center gap-2 mb-2">
                                <Maximize2 className="h-5 w-5 text-blue-600" />
                                <span className="font-semibold text-gray-900">Most Space</span>
                              </div>
                              <p className="text-sm text-gray-700 font-medium">{listing.address}</p>
                              {listing.aiAnalysis?.headline && (
                                <p className="text-xs text-gray-600 mt-1">{listing.aiAnalysis.headline}</p>
                              )}
                            </div>
                          ) : null;
                        })()}

                        {report.synthesis.category_winners.best_yard && (() => {
                          const listing = report.listings.find(l => l.mlsNumber === report.synthesis!.category_winners!.best_yard);
                          return listing ? (
                            <div key="best_yard" className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                              <div className="flex items-center gap-2 mb-2">
                                <Trees className="h-5 w-5 text-green-600" />
                                <span className="font-semibold text-gray-900">Best Outdoor Space</span>
                              </div>
                              <p className="text-sm text-gray-700 font-medium">{listing.address}</p>
                              {listing.aiAnalysis?.headline && (
                                <p className="text-xs text-gray-600 mt-1">{listing.aiAnalysis.headline}</p>
                              )}
                            </div>
                          ) : null;
                        })()}

                        {report.synthesis.category_winners.most_budget_room && (() => {
                          const listing = report.listings.find(l => l.mlsNumber === report.synthesis!.category_winners!.most_budget_room);
                          return listing ? (
                            <div key="most_budget_room" className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                              <div className="flex items-center gap-2 mb-2">
                                <DollarSign className="h-5 w-5 text-purple-600" />
                                <span className="font-semibold text-gray-900">Best Value</span>
                              </div>
                              <p className="text-sm text-gray-700 font-medium">{listing.address}</p>
                              {listing.aiAnalysis?.headline && (
                                <p className="text-xs text-gray-600 mt-1">{listing.aiAnalysis.headline}</p>
                              )}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Ranked Picks */}
                  {report.synthesis.ranked_picks && report.synthesis.ranked_picks.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-gray-900">How I'd Rank These Properties:</h3>
                      {report.synthesis.ranked_picks.map((pick, index) => {
                        // Find the corresponding listing to get the address
                        const listing = report.listings.find(l => l.mlsNumber === pick.mlsNumber);
                        return (
                          <div key={pick.mlsNumber} className="bg-white rounded-lg p-4 border border-blue-100">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge className="bg-blue-600 text-white">{pick.label}</Badge>
                                  {listing && (
                                    <span className="text-sm text-gray-600">
                                      {listing.address}, {listing.city}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-700">{pick.why}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Next Steps */}
                  <div className="bg-blue-600 text-white rounded-lg p-4">
                    <h3 className="font-semibold mb-2">Next Steps:</h3>
                    <p>{report.synthesis.next_steps}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Comparison Table */}
            {report.synthesis?.requirements_table && report.synthesis.requirements_table.length > 0 && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle>Requirements Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b-2 border-gray-300">
                          <th className="text-left p-3 font-semibold text-gray-700 bg-gray-50">Requirement</th>
                          {report.synthesis.ranked_picks.map((pick, idx) => {
                            const listing = report.listings.find(l => l.mlsNumber === pick.mlsNumber);
                            return (
                              <th key={pick.mlsNumber} className="p-3 text-center bg-gray-50 border-l border-gray-200">
                                <div className="flex flex-col items-center gap-1">
                                  <Badge className="bg-blue-600 text-white text-xs">{idx + 1}</Badge>
                                  <span className="text-xs font-medium text-gray-700">{listing?.address}</span>
                                  {listing?.aiAnalysis?.summary_for_buyer && (
                                    <span className="text-xs text-gray-500 mt-1 max-w-[150px] line-clamp-2">
                                      {listing.aiAnalysis.summary_for_buyer}
                                    </span>
                                  )}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { key: 'meets_bedrooms', label: 'Bedrooms' },
                          { key: 'within_budget', label: 'Budget' },
                          { key: 'in_target_area', label: 'Location' },
                          { key: 'has_amenities', label: 'Amenities' },
                          { key: 'good_condition', label: 'Condition' },
                          { key: 'outdoor_space', label: 'Outdoor Space' },
                          { key: 'good_layout', label: 'Layout' },
                          { key: 'low_noise', label: 'Quiet' }
                        ].map((req, reqIdx) => (
                          <tr key={req.key} className={reqIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="p-3 font-medium text-gray-700 border-b border-gray-200">{req.label}</td>
                            {report.synthesis!.ranked_picks.map((pick) => {
                              const entry = report.synthesis!.requirements_table!.find(e => e.mlsNumber === pick.mlsNumber);
                              const flag = entry?.flags[req.key as keyof RequirementsFlags] || '❌';
                              return (
                                <td key={pick.mlsNumber} className="p-3 text-center border-b border-l border-gray-200">
                                  <span className="text-2xl">{flag}</span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Property Details
              </h2>
              <p className="text-gray-600">
                Complete information for each recommended property.
              </p>
            </div>

            <div className="space-y-8">
              {report.listings.map((listing, index) => (
                <Card key={listing.mlsNumber || index} className="overflow-hidden">
                  {/* Property Image */}
                  {listing.images && listing.images.length > 0 && (
                    <div className="aspect-[2/1] bg-gray-100">
                      <img
                        src={listing.images[0]}
                        alt={`${listing.address} - ${listing.city}, ${listing.state}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.onerror = null;
                          target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTVlN2ViIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzZiNzI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
                        }}
                      />
                    </div>
                  )}

                  <CardContent className="p-6">
                    {/* Property Header */}
                    <div className="mb-6">
                      {/* Rank Badge */}
                      {report.synthesis?.ranked_picks && (() => {
                        const rankIndex = report.synthesis.ranked_picks.findIndex(p => p.mlsNumber === listing.mlsNumber);
                        if (rankIndex >= 0) {
                          const rankLabels = ['1st', '2nd', '3rd', '4th', '5th'];
                          return (
                            <Badge className="mb-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm px-3 py-1">
                              {rankLabels[rankIndex] || `${rankIndex + 1}th`} Choice
                            </Badge>
                          );
                        }
                        return null;
                      })()}

                      {/* Headline (AI-generated) */}
                      {listing.aiAnalysis?.headline && (
                        <div className="text-xl font-semibold text-blue-700 mb-2">
                          {listing.aiAnalysis.headline}
                        </div>
                      )}

                      <div className="text-3xl font-bold text-gray-900 mb-1">
                        ${listing.listPrice?.toLocaleString()}
                      </div>
                      <div className="text-lg font-medium text-gray-700">
                        {listing.address}
                      </div>
                      <div className="text-gray-600">
                        {listing.city}, {listing.state} {listing.zip}
                      </div>
                    </div>

                    {/* Property Stats */}
                    <div className="flex items-center gap-6 mb-6 pb-6 border-b">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{listing.bedrooms}</div>
                        <div className="text-xs text-gray-600">Beds</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{listing.bathrooms}</div>
                        <div className="text-xs text-gray-600">Baths</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">
                          {listing.sqft ? Math.round(listing.sqft).toLocaleString() : '—'}
                        </div>
                        <div className="text-xs text-gray-600">Sq Ft</div>
                      </div>
                    </div>

                    {/* Visual Highlights (Photo Analysis) */}
                    {(listing.aiAnalysis?.photo_headline || listing.aiAnalysis?.photo_summary) && (
                      <div className="mb-6 p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                        <div className="flex items-start gap-2 mb-2">
                          <Star className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            {listing.aiAnalysis.photo_headline && (
                              <h3 className="font-semibold text-gray-900 mb-1">
                                {listing.aiAnalysis.photo_headline}
                              </h3>
                            )}
                            {listing.aiAnalysis.photo_summary && (
                              <p className="text-sm text-gray-700">
                                {listing.aiAnalysis.photo_summary}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* AI Analysis */}
                    {listing.aiAnalysis && (
                      <ClientSummaryDeep
                        analysis={listing.aiAnalysis}
                        listing={listing}
                        isLoadingPhotos={false}
                      />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Footer CTA */}
        <Card className="mt-8 bg-blue-50 border-blue-200">
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
      </div>
    </div>
  );
}

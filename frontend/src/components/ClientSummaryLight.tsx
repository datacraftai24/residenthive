import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { getConcernTemplate } from '@/lib/benefitMapping';

interface WhatsMatchingItem {
  requirement: string;
  evidence: string;
  source: 'description' | 'meta';
}

interface WhatsMissingItem {
  concern: string;
  severity: 'high' | 'medium' | 'low';
  workaround?: string;
}

interface RedFlagItem {
  concern: string;
  quote?: string;
  risk_level: 'high' | 'medium' | 'low';
  follow_up?: string;
}

interface PhotoRedFlagItem {
  concern: string;
  evidence: string;
  severity: 'high' | 'medium' | 'low';
  follow_up?: string;
}

interface ListingAnalysis {
  fit_score?: number | null;
  whats_matching?: WhatsMatchingItem[];
  whats_missing?: WhatsMissingItem[];
  red_flags?: RedFlagItem[];
  photo_red_flags?: PhotoRedFlagItem[];
}

interface ClientSummaryLightProps {
  analysis: ListingAnalysis;
  isLoadingPhotos?: boolean;
}

/**
 * Light Client Summary for non-top properties
 * Quick report card: 2-3 matches, 1-2 concerns, simple badge
 */
export function ClientSummaryLight({ analysis, isLoadingPhotos }: ClientSummaryLightProps) {
  // Get top 3 matches only
  const topMatches = (analysis.whats_matching || []).slice(0, 3);

  // Get top 2 concerns (high severity first)
  const allConcerns: Array<{
    label: string;
    severity: 'high' | 'medium' | 'low';
    quote?: string;
    followUp?: string;
  }> = [];

  // Add whats_missing
  (analysis.whats_missing || []).forEach(item => {
    allConcerns.push({
      label: item.concern || '',
      severity: item.severity,
      followUp: item.workaround
    });
  });

  // Add red_flags
  (analysis.red_flags || []).forEach(item => {
    allConcerns.push({
      label: item.concern || '',
      severity: item.risk_level,
      quote: item.quote,
      followUp: item.follow_up
    });
  });

  // Add photo red flags if not loading
  if (!isLoadingPhotos) {
    (analysis.photo_red_flags || []).forEach(item => {
      allConcerns.push({
        label: item.concern || '',
        severity: item.severity,
        followUp: item.follow_up
      });
    });
  }

  // Sort by severity: HIGH first
  const severityOrder = { high: 0, medium: 1, low: 2 };
  allConcerns.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Filter out empty labels and take top 2
  const topConcerns = allConcerns
    .filter(c => c.label && c.label !== 'undefined')
    .slice(0, 2);

  // Calculate overall fit badge
  const fitScore = analysis.fit_score ?? null;
  const hasHighSeverity = topConcerns.some(c => c.severity === 'high');

  let level: string;
  let emoji: string;
  let summary: string;

  if (fitScore === null) {
    level = 'Fair';
    emoji = '🟠';
    summary = 'Based on requirements and listing details.';
  } else if (fitScore >= 90 && !hasHighSeverity) {
    level = 'Excellent';
    emoji = '🟢';
    summary = 'Strong match to your key requirements.';
  } else if (fitScore >= 90 && hasHighSeverity) {
    level = 'Good';
    emoji = '🟡';
    summary = 'Strong fit with some items to review.';
  } else if (fitScore >= 70) {
    level = 'Good';
    emoji = '🟡';
    summary = 'Matches most priorities.';
  } else if (fitScore >= 50) {
    level = 'Fair';
    emoji = '🟠';
    summary = 'Partial match.';
  } else {
    level = 'Weak';
    emoji = '🔴';
    summary = 'Limited match to your needs.';
  }

  return (
    <Card className="bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
      <CardContent className="p-6 space-y-6">
        {/* Section 1: Why This Could Be a Good Match */}
        <div>
          <h3 className="text-lg font-bold text-purple-900 mb-3 flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Why This Could Be a Good Match
          </h3>
          {topMatches.length > 0 ? (
            <ul className="space-y-2">
              {topMatches.map((match, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-purple-900">
                  <span className="text-green-600 mt-0.5">✓</span>
                  <span>
                    <strong>{match.requirement}:</strong> {match.evidence}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-purple-700 italic">
              This home loosely matches your search filters.
            </p>
          )}
        </div>

        {/* Section 2: What You Should Know (if concerns exist) */}
        {topConcerns.length > 0 && (
          <div>
            <h3 className="text-lg font-bold text-purple-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              What You Should Know
            </h3>
            <ul className="space-y-2">
              {topConcerns.map((concern, idx) => {
                const icon = concern.severity === 'high' || concern.severity === 'medium' ? '⚠️' : 'ℹ️';
                const message = getConcernTemplate(concern.label, concern.quote, concern.followUp);

                return (
                  <li key={idx} className="flex items-start gap-2 text-sm text-purple-900">
                    <span className="mt-0.5">{icon}</span>
                    <span>{message}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Section 3: Overall Fit */}
        <div className="pt-4 border-t border-purple-200">
          <h3 className="text-lg font-bold text-purple-900 mb-3 flex items-center gap-2">
            <Info className="h-5 w-5" />
            Overall Fit
          </h3>
          <div className="flex items-center gap-3">
            <Badge
              className={`text-lg px-4 py-1.5 ${
                level === 'Excellent'
                  ? 'bg-green-600'
                  : level === 'Good'
                  ? 'bg-yellow-500'
                  : level === 'Fair'
                  ? 'bg-orange-500'
                  : 'bg-red-600'
              } text-white`}
            >
              {emoji} {level} Match
            </Badge>
            <p className="text-sm text-purple-700">{summary}</p>
          </div>
        </div>

        {/* Photo Analysis Loading State */}
        {isLoadingPhotos && (
          <div className="text-xs text-purple-600 italic border-t border-purple-200 pt-3">
            Photo analysis is still running – details will refresh shortly.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

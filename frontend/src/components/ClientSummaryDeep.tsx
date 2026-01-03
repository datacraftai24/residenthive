import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react';
import {
  getBenefitHeadline,
  getFeatureKey,
  evidenceMentionsRequirement,
  cleanEvidence,
  getConcernTemplate,
  buildSpaceBullet,
  buildParkingBullet,
  buildKitchenBullet,
  buildBackyardBullet,
  parseBedroomCount,
  parseBathroomCount,
  type FeatureKey
} from '@/lib/benefitMapping';

// Physical features that can be confirmed in photos
const PHYSICAL_FEATURES: FeatureKey[] = ['parking', 'backyard', 'kitchen', 'basement', 'light'];

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

interface PhotoMatchItem {
  requirement: string;
  status: 'present' | 'unclear' | 'absent';
  evidence: string;
  confidence: 'high' | 'medium' | 'low';
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
  photo_matches?: PhotoMatchItem[];
  photo_red_flags?: PhotoRedFlagItem[];
  agent_take_ai?: string;
  agent_take_final?: string;
  vision_complete?: boolean;
}

interface BuyerProfile {
  hasKids?: boolean;
  workFromHome?: boolean;
  entertainsOften?: boolean;
  aiSummary?: string;
  min_bedrooms?: number;
  min_bathrooms?: number;
}

interface Listing {
  yearBuilt?: number;
  year_built?: number;
  bedrooms?: number;
  bathrooms?: number;
}

interface ClientSummaryDeepProps {
  analysis: ListingAnalysis;
  buyerProfile?: BuyerProfile;
  listing?: Listing;
  isLoadingPhotos?: boolean;
}

interface MergedMatch {
  featureKey: FeatureKey;
  requirementText: string;
  textEvidence?: string;
  photoEvidence?: string;
  headline: string;
}

interface Concern {
  label: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
}

/**
 * Deep Client Summary for Top Pick properties
 * Full narrative: benefit templates, photo integration, "My Take"
 */
export function ClientSummaryDeep({
  analysis,
  buyerProfile,
  listing,
  isLoadingPhotos
}: ClientSummaryDeepProps) {
  // Merge text + photo matches with benefit templates and feature-based deduplication
  const getMergedMatches = (): MergedMatch[] => {
    const merged: Record<FeatureKey, {
      featureKey: FeatureKey;
      requirementText?: string;
      textEvidence?: string;
      photoEvidence?: string;
    }> = {};

    // Merge text matches by feature key
    (analysis.whats_matching || []).forEach(m => {
      const key = getFeatureKey(m.requirement);
      const existing = merged[key] ?? { featureKey: key };

      merged[key] = {
        ...existing,
        requirementText: existing.requirementText ?? m.requirement,
        textEvidence: existing.textEvidence ?? m.evidence,
      };
    });

    // Merge photo matches by feature key
    if (!isLoadingPhotos) {
      (analysis.photo_matches || [])
        .filter(pm => pm.status === 'present' && pm.confidence !== 'low')
        .forEach(pm => {
          const key = getFeatureKey(pm.requirement);
          const existing = merged[key] ?? { featureKey: key };

          merged[key] = {
            ...existing,
            photoEvidence: existing.photoEvidence ?? pm.evidence,
          };
        });
    }

    // Build final bullet list
    const bullets: MergedMatch[] = [];

    // Check for bed/bath merge opportunity
    const hasBeds = merged['bedrooms'];
    const hasBaths = merged['bathrooms'];

    if (hasBeds || hasBaths) {
      // Try to build merged space bullet
      const bedsActual = parseBedroomCount(
        hasBeds?.textEvidence || hasBeds?.photoEvidence,
        listing
      );
      const bathsActual = parseBathroomCount(
        hasBaths?.textEvidence || hasBaths?.photoEvidence,
        listing
      );

      if (bedsActual && bathsActual) {
        const spaceBullet = buildSpaceBullet({
          bedsActual,
          bathsActual,
          bedsMin: buyerProfile?.min_bedrooms,
          bathsMin: buyerProfile?.min_bathrooms,
          profile: buyerProfile
        });

        if (spaceBullet) {
          // Add merged space bullet
          bullets.push({
            featureKey: 'bedrooms', // Use bedrooms as primary key
            requirementText: 'Space',
            textEvidence: spaceBullet.body,
            photoEvidence: hasBeds?.photoEvidence || hasBaths?.photoEvidence,
            headline: spaceBullet.headline
          });
        }
      }

      // ALWAYS remove bed/bath from merged to prevent raw AI text from rendering
      // Even if we didn't create a space bullet (missing actuals or doesn't meet minimums)
      delete merged['bedrooms'];
      delete merged['bathrooms'];
    }

    // Process remaining features with benefit-focused templates
    Object.entries(merged).forEach(([key, m]) => {
      const featureKey = key as FeatureKey;

      // Exclude location and generic "other" matches
      if (featureKey === 'other') {
        // Skip location-like matches that can't be confirmed in photos
        const evidence = m.textEvidence || m.photoEvidence || '';
        if (evidence.toLowerCase().includes('triangle') ||
            evidence.toLowerCase().includes('neighborhood') ||
            evidence.toLowerCase().includes('area')) {
          return;
        }
      }

      // Validate and clean evidence
      const validTextEvidence = evidenceMentionsRequirement(m.textEvidence, featureKey)
        ? cleanEvidence(m.textEvidence)
        : undefined;

      const validPhotoEvidence = evidenceMentionsRequirement(m.photoEvidence, featureKey)
        ? cleanEvidence(m.photoEvidence)
        : undefined;

      if (!validTextEvidence && !validPhotoEvidence) {
        return; // Skip if no valid evidence
      }

      // Build benefit-focused body text for key features
      let bodyText: string;
      let headline: string;

      if (featureKey === 'parking') {
        headline = 'Winter-friendly parking + storage';
        bodyText = buildParkingBullet(validTextEvidence, validPhotoEvidence);
      } else if (featureKey === 'kitchen') {
        headline = "Kitchen that's already done";
        bodyText = buildKitchenBullet(validTextEvidence || validPhotoEvidence);
      } else if (featureKey === 'backyard') {
        headline = 'Usable outdoor space';
        bodyText = buildBackyardBullet(validTextEvidence || validPhotoEvidence, buyerProfile);
      } else {
        // Use default template for other features
        headline = getBenefitHeadline(m.requirementText || featureKey);
        bodyText = validTextEvidence || validPhotoEvidence || '';
      }

      bullets.push({
        featureKey,
        requirementText: m.requirementText || featureKey,
        textEvidence: bodyText,
        photoEvidence: validPhotoEvidence,
        headline
      });
    });

    // Sort by importance: space → parking → kitchen → backyard → other
    const importanceOrder: Record<FeatureKey, number> = {
      bedrooms: 0,
      bathrooms: 1,
      parking: 2,
      kitchen: 3,
      backyard: 4,
      basement: 5,
      light: 6,
      other: 7
    };

    bullets.sort((a, b) => importanceOrder[a.featureKey] - importanceOrder[b.featureKey]);

    // Cap at 4 bullets for Deep view
    return bullets.slice(0, 4);
  };

  // Aggregate concerns with teaching tone
  const getConcerns = (): Concern[] => {
    const concerns: Concern[] = [];
    const yearBuilt = listing?.yearBuilt || listing?.year_built;

    // What's Missing
    (analysis.whats_missing || []).forEach(item => {
      const label = item.concern || '';
      const message = getConcernTemplate(label, undefined, item.workaround, yearBuilt);

      concerns.push({
        label,
        severity: item.severity,
        message
      });
    });

    // Red Flags
    (analysis.red_flags || []).forEach(item => {
      const label = item.concern || '';
      const message = getConcernTemplate(label, item.quote, item.follow_up, yearBuilt);

      concerns.push({
        label,
        severity: item.risk_level,
        message
      });
    });

    // Photo Red Flags
    if (!isLoadingPhotos) {
      (analysis.photo_red_flags || []).forEach(item => {
        const label = item.concern || '';
        let message = getConcernTemplate(label, undefined, item.follow_up, yearBuilt);

        // Add "(visible in photos)" context
        if (!message.toLowerCase().includes('photo')) {
          message = message.replace(' — ', ' (visible in photos) — ');
        }

        concerns.push({
          label,
          severity: item.severity,
          message
        });
      });
    }

    // Sort by severity: HIGH first
    const severityOrder = { high: 0, medium: 1, low: 2 };
    concerns.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Filter out empty labels and take top 5 (increased from 3 to include photo insights)
    return concerns.filter(c => c.label && c.label !== 'undefined').slice(0, 5);
  };

  // Calculate overall fit with specific hints
  const getOverallFit = (): {
    level: string;
    badge: string;
    summary: string;
    emoji: string;
    myTake?: string;
  } => {
    const fitScore = analysis.fit_score ?? null;
    const concerns = getConcerns();
    const hasHighSeverity = concerns.some(c => c.severity === 'high');

    // Extract concern themes
    const concernLabels = concerns.map(c => c.label.toLowerCase());
    const hasConditionConcerns = concernLabels.some(
      l => l.includes('condition') || l.includes('age') || l.includes('vague')
    );
    const hasStructuralConcerns = concernLabels.some(
      l => l.includes('roof') || l.includes('foundation') || l.includes('siding')
    );
    const hasSizeConcerns = concernLabels.some(
      l => l.includes('size') || l.includes('yard') || l.includes('space')
    );

    let level: string;
    let emoji: string;
    let summary: string;

    if (fitScore === null) {
      level = 'Fair';
      emoji = '🟠';
      summary = 'Fit score not available – based only on requirements and listing details.';
    } else if (fitScore >= 90 && !hasHighSeverity) {
      level = 'Excellent';
      emoji = '🟢';
      summary = 'Strong match to your key requirements with no major concerns flagged.';
    } else if (fitScore >= 90 && hasHighSeverity) {
      level = 'Good';
      emoji = '🟡';
      if (hasStructuralConcerns) {
        summary = 'Strong fit on paper, but worth checking structural condition during showing.';
      } else {
        summary = 'Strong fit on paper, but there are some issues worth a closer look.';
      }
    } else if (fitScore >= 70) {
      level = 'Good';
      emoji = '🟡';
      if (hasConditionConcerns) {
        summary =
          'Matches most of your priorities; mainly worth double-checking general condition during a showing.';
      } else if (hasSizeConcerns) {
        summary =
          'Matches most of your priorities; mainly worth confirming room sizes and layout during a showing.';
      } else {
        summary = 'Matches most of your priorities; a few items to double-check during a showing.';
      }
    } else if (fitScore >= 50) {
      level = 'Fair';
      emoji = '🟠';
      summary = 'Partial match. Could work if you\'re flexible on some preferences.';
    } else {
      level = 'Weak';
      emoji = '🔴';
      summary = "Doesn't line up well with what you said you want. Probably not a top candidate.";
    }

    // Get "My Take" - prioritize agent_take_final over agent_take_ai
    const myTake = analysis.agent_take_final || analysis.agent_take_ai;

    return {
      level: level.charAt(0).toUpperCase() + level.slice(1),
      badge: emoji,
      summary,
      emoji,
      myTake
    };
  };

  const mergedMatches = getMergedMatches();
  const concerns = getConcerns();

  return (
    <Card className="bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
      <CardContent className="p-6 space-y-6">
        {/* Section 1: Why This Could Be a Good Match */}
        <div>
          <h3 className="text-lg font-bold text-purple-900 mb-3 flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Why This Could Be a Good Match
          </h3>
          {mergedMatches.length > 0 ? (
            <ul className="space-y-3">
              {mergedMatches.map((match, idx) => {
                const hasPhoto = !!match.photoEvidence;
                const isPhysicalFeature = PHYSICAL_FEATURES.includes(match.featureKey);
                const shouldShowPhotoTag = hasPhoto && isPhysicalFeature;
                const evidence = match.textEvidence || match.photoEvidence || 'This property meets your requirement.';
                const headline = match.headline;

                return (
                  <li key={idx} className="text-sm text-purple-900">
                    <div className="font-semibold text-purple-900 mb-1">{headline}</div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-600 mt-0.5">✓</span>
                      <span>
                        {evidence}
                        {shouldShowPhotoTag && (
                          <span className="text-purple-600 italic"> (confirmed in photos)</span>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-purple-700 italic">
              This home loosely matches your search filters but doesn't strongly hit any specific
              must-have. Review details with your agent before shortlisting.
            </p>
          )}
        </div>

        {/* Section 2: What You Should Know */}
        {concerns.length > 0 && (
          <div>
            <h3 className="text-lg font-bold text-purple-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              What You Should Know
            </h3>
            <ul className="space-y-2">
              {concerns.map((concern, idx) => {
                const icon =
                  concern.severity === 'high' || concern.severity === 'medium' ? '⚠️' : 'ℹ️';
                return (
                  <li key={idx} className="flex items-start gap-2 text-sm text-purple-900">
                    <span className="mt-0.5">{icon}</span>
                    <span>{concern.message}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Section 3: My Take - AI-generated agent perspective */}
        <div className="pt-4 border-t border-purple-200">
          {(() => {
            const myTake = analysis.agent_take_final || analysis.agent_take_ai;
            const visionComplete = analysis.vision_complete;

            if (myTake && visionComplete) {
              // Full My Take with photo analysis complete
              return (
                <div className="pl-4 border-l-4 border-purple-300 bg-white/50 rounded p-3">
                  <p className="text-sm text-purple-900">
                    <strong className="text-purple-800">My take:</strong>{' '}
                    <span className="italic">{myTake}</span>
                  </p>
                </div>
              );
            } else if (myTake && !visionComplete) {
              // Text-only My Take, photo analysis pending
              return (
                <div className="pl-4 border-l-4 border-purple-300 bg-white/50 rounded p-3">
                  <p className="text-sm text-purple-900">
                    <strong className="text-purple-800">My take:</strong>{' '}
                    <span className="italic">{myTake}</span>
                    <span className="text-purple-600 text-xs ml-2">(Photo review in progress)</span>
                  </p>
                </div>
              );
            } else if (!myTake) {
              // Loading state - no My Take yet
              return (
                <div className="pl-4 border-l-4 border-purple-300 bg-white/50 rounded p-3">
                  <p className="text-sm text-purple-700 italic">
                    <strong className="text-purple-800">My take:</strong>{' '}
                    Finalizing analysis for this property...
                  </p>
                </div>
              );
            }

            return null;
          })()}
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

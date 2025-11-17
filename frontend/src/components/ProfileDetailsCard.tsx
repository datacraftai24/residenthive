import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  MapPin,
  Bed,
  Bath,
  Star,
  XCircle,
  Settings,
  Camera
} from "lucide-react";
import type { BuyerProfile } from "@shared/schema";

interface ProfileDetailsCardProps {
  profile: BuyerProfile;
}

export default function ProfileDetailsCard({ profile }: ProfileDetailsCardProps) {
  // Debug logging to trace AI fields
  console.log('[ProfileDetailsCard] Profile data:', {
    id: profile.id,
    name: profile.name,
    hasAiSummary: !!profile.aiSummary,
    aiSummaryLength: profile.aiSummary?.length || 0,
    hasDecisionDrivers: !!(profile.decisionDrivers && profile.decisionDrivers.length > 0),
    decisionDriversCount: profile.decisionDrivers?.length || 0,
    hasConstraints: !!(profile.constraints && profile.constraints.length > 0),
    constraintsCount: profile.constraints?.length || 0,
    hasNiceToHaves: !!(profile.niceToHaves && profile.niceToHaves.length > 0),
    niceToHavesCount: profile.niceToHaves?.length || 0,
    hasVisionChecklist: !!profile.visionChecklist,
    conditionalCheck: (profile.aiSummary || (profile.decisionDrivers && profile.decisionDrivers.length > 0) || (profile.constraints && profile.constraints.length > 0))
  });

  return (
    <div className="space-y-6">
      {/* Profile Overview */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{profile.name}</h2>
            {profile.email && (
              <p className="text-slate-600 mb-2">{profile.email}</p>
            )}
            <p className="text-3xl font-bold text-primary">{profile.budget}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-600 mb-1">Priority Score</p>
            <div className="flex items-center space-x-2">
              <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
                <span className="text-white font-bold">{profile.priorityScore || 50}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Preferred Areas */}
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <MapPin className="h-4 w-4 text-blue-600" />
            <h3 className="font-medium text-slate-900">Areas</h3>
          </div>
          <p className="text-lg font-semibold text-slate-900">
            {profile.preferredAreas && profile.preferredAreas.length > 0
              ? profile.preferredAreas.join(", ")
              : profile.location || "Flexible"}
          </p>
        </div>

        {/* Bedrooms */}
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Bed className="h-4 w-4 text-purple-600" />
            <h3 className="font-medium text-slate-900">Bedrooms</h3>
          </div>
          <p className="text-lg font-semibold text-slate-900">{profile.bedrooms}</p>
        </div>

        {/* Bathrooms */}
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Bath className="h-4 w-4 text-teal-600" />
            <h3 className="font-medium text-slate-900">Bathrooms</h3>
          </div>
          <p className="text-lg font-semibold text-slate-900">{profile.bathrooms}</p>
        </div>

        {/* Home Type */}
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <DollarSign className="h-4 w-4 text-orange-600" />
            <h3 className="font-medium text-slate-900">Home Type</h3>
          </div>
          <p className="text-lg font-semibold text-slate-900 capitalize">
            {profile.homeType?.replace('-', ' ') || 'Not specified'}
          </p>
        </div>

        {/* Must-Have Features (Green - Non-Negotiable) */}
        <div className="bg-slate-50 rounded-lg p-4 md:col-span-3">
          <div className="flex items-center space-x-2 mb-3">
            <Star className="h-4 w-4 text-green-600" />
            <h3 className="font-medium text-slate-900">Must-Haves</h3>
            <span className="text-xs text-slate-500">(Non-negotiable)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.mustHaveFeatures && profile.mustHaveFeatures.length > 0 ? (
              profile.mustHaveFeatures.map((feature, index) => (
                <Badge key={index} className="bg-green-100 text-green-800 hover:bg-green-100">
                  {feature}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-slate-500">No must-have features</span>
            )}
          </div>
        </div>

        {/* Nice-to-Have Features (Blue - Preferred but Flexible) */}
        {profile.niceToHaves && profile.niceToHaves.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-4 md:col-span-3">
            <div className="flex items-center space-x-2 mb-3">
              <Star className="h-4 w-4 text-blue-600" />
              <h3 className="font-medium text-slate-900">Nice-to-Haves</h3>
              <span className="text-xs text-slate-500">(Preferred but flexible)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.niceToHaves.map((feature, index) => (
                <Badge key={index} className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                  {feature}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Lifestyle Priorities (Purple - Neighborhood/Vibe/Community) */}
        {profile.lifestyleDrivers && profile.lifestyleDrivers.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-4 md:col-span-3">
            <div className="flex items-center space-x-2 mb-3">
              <Star className="h-4 w-4 text-purple-600" />
              <h3 className="font-medium text-slate-900">Lifestyle Priorities</h3>
              <span className="text-xs text-slate-500">(Neighborhood/Community/Family)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.lifestyleDrivers.map((driver, index) => (
                <Badge key={index} className="bg-purple-100 text-purple-800 hover:bg-purple-100">
                  {driver}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* AI Insights - Summary, Decision Drivers, Constraints */}
        {(profile.aiSummary || (profile.decisionDrivers && profile.decisionDrivers.length > 0) || (profile.constraints && profile.constraints.length > 0)) && (
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-5 md:col-span-3 border border-amber-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Star className="h-5 w-5 text-amber-600" />
                <h3 className="font-semibold text-slate-900">AI Insights</h3>
              </div>
              {profile.priorityScore !== undefined && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                  Priority: {profile.priorityScore}/100
                </Badge>
              )}
            </div>

            {/* AI Summary */}
            {profile.aiSummary && (
              <div className="mb-4">
                <p className="text-sm text-slate-700 leading-relaxed">
                  {profile.aiSummary}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Top Decision Drivers */}
              {profile.decisionDrivers && profile.decisionDrivers.length > 0 && (
                <div className="bg-white rounded-lg p-4 border border-amber-100">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Top Decision Drivers</h4>
                  <ul className="space-y-2">
                    {profile.decisionDrivers.map((driver, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <span className="text-green-600 mt-0.5">✓</span>
                        <span className="text-sm text-slate-700">{driver}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Key Constraints */}
              {profile.constraints && profile.constraints.length > 0 && (
                <div className="bg-white rounded-lg p-4 border border-amber-100">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Key Constraints</h4>
                  <ul className="space-y-2">
                    {profile.constraints.map((constraint, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <span className="text-orange-600 mt-0.5">!</span>
                        <span className="text-sm text-slate-700">{constraint}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Photo Requirements (Vision Checklist) */}
        {profile.visionChecklist && (
          Object.values(profile.visionChecklist).some(arr => arr && arr.length > 0)
        ) && (
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-5 md:col-span-3 border border-indigo-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Camera className="h-5 w-5 text-indigo-600" />
                <h3 className="font-semibold text-slate-900">AI Photo Requirements</h3>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4">
              What the AI will look for in listing photos for this buyer
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Structural */}
              {profile.visionChecklist.structural && profile.visionChecklist.structural.length > 0 && (
                <div className="bg-white rounded-lg p-4 border border-indigo-100">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center space-x-2">
                    <span className="text-indigo-600">🏠</span>
                    <span>Structural</span>
                  </h4>
                  <ul className="space-y-1.5">
                    {profile.visionChecklist.structural.map((item, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <span className="text-indigo-600 mt-0.5">•</span>
                        <span className="text-sm text-slate-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Lifestyle */}
              {profile.visionChecklist.lifestyle && profile.visionChecklist.lifestyle.length > 0 && (
                <div className="bg-white rounded-lg p-4 border border-indigo-100">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center space-x-2">
                    <span className="text-purple-600">🌳</span>
                    <span>Lifestyle</span>
                  </h4>
                  <ul className="space-y-1.5">
                    {profile.visionChecklist.lifestyle.map((item, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <span className="text-purple-600 mt-0.5">•</span>
                        <span className="text-sm text-slate-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Dealbreakers */}
              {profile.visionChecklist.dealbreakers && profile.visionChecklist.dealbreakers.length > 0 && (
                <div className="bg-white rounded-lg p-4 border border-indigo-100">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center space-x-2">
                    <span className="text-red-600">🚫</span>
                    <span>Dealbreakers</span>
                  </h4>
                  <ul className="space-y-1.5">
                    {profile.visionChecklist.dealbreakers.map((item, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <span className="text-red-600 mt-0.5">!</span>
                        <span className="text-sm text-slate-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Optional */}
              {profile.visionChecklist.optional && profile.visionChecklist.optional.length > 0 && (
                <div className="bg-white rounded-lg p-4 border border-indigo-100">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center space-x-2">
                    <span className="text-slate-600">✨</span>
                    <span>Optional</span>
                  </h4>
                  <ul className="space-y-1.5">
                    {profile.visionChecklist.optional.map((item, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <span className="text-slate-600 mt-0.5">+</span>
                        <span className="text-sm text-slate-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dealbreakers */}
        <div className="bg-slate-50 rounded-lg p-4 md:col-span-3">
          <div className="flex items-center space-x-2 mb-3">
            <XCircle className="h-4 w-4 text-red-600" />
            <h3 className="font-medium text-slate-900">Dealbreakers</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.dealbreakers && profile.dealbreakers.length > 0 ? (
              profile.dealbreakers.map((dealbreaker, index) => (
                <Badge key={index} className="bg-red-100 text-red-800 hover:bg-red-100">
                  {dealbreaker}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-slate-500">No specific dealbreakers</span>
            )}
          </div>
        </div>

        {/* Flexibility Scores with Explanations */}
        {(profile.budgetFlexibility !== undefined ||
          profile.locationFlexibility !== undefined ||
          profile.timingFlexibility !== undefined) && (
          <div className="bg-slate-50 rounded-lg p-4 md:col-span-3">
            <div className="flex items-center space-x-2 mb-4">
              <Settings className="h-4 w-4 text-slate-600" />
              <h3 className="font-medium text-slate-900">Flexibility</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {profile.budgetFlexibility !== undefined && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-slate-700">Budget</p>
                    <p className="text-sm font-semibold text-slate-900">{profile.budgetFlexibility}%</p>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 mb-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${profile.budgetFlexibility}%` }}
                    />
                  </div>
                  {profile.flexibilityExplanations?.budget && (
                    <p className="text-xs text-slate-600 mt-1">
                      {profile.flexibilityExplanations.budget}
                    </p>
                  )}
                </div>
              )}
              {profile.locationFlexibility !== undefined && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-slate-700">Location</p>
                    <p className="text-sm font-semibold text-slate-900">{profile.locationFlexibility}%</p>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 mb-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${profile.locationFlexibility}%` }}
                    />
                  </div>
                  {profile.flexibilityExplanations?.location && (
                    <p className="text-xs text-slate-600 mt-1">
                      {profile.flexibilityExplanations.location}
                    </p>
                  )}
                </div>
              )}
              {profile.timingFlexibility !== undefined && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-slate-700">Timing</p>
                    <p className="text-sm font-semibold text-slate-900">{profile.timingFlexibility}%</p>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 mb-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${profile.timingFlexibility}%` }}
                    />
                  </div>
                  {profile.flexibilityExplanations?.timing && (
                    <p className="text-xs text-slate-600 mt-1">
                      {profile.flexibilityExplanations.timing}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Raw Input (if available) */}
      {profile.rawInput && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-medium text-slate-900 mb-3">Original Input</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{profile.rawInput}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { Sparkles, TrendingUp, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

interface AIInsightsProps {
  analysis: AIAnalysis;
}

export default function AIInsights({ analysis }: AIInsightsProps) {
  const { analysis_json, score } = analysis;
  const matchPercentage = Math.round((score / 100) * 100);

  const getMatchColor = (percentage: number) => {
    if (percentage >= 80) return "text-green-600";
    if (percentage >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getMatchLabel = (percentage: number) => {
    if (percentage >= 80) return "Excellent Match";
    if (percentage >= 60) return "Good Match";
    return "Fair Match";
  };

  return (
    <Card className="border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          AI-Powered Buyer Insights
          <Badge variant="secondary" className="ml-auto">
            ResidentHive Exclusive
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Match Score */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Match Score
              </h3>
              <p className="text-sm text-gray-600">
                {getMatchLabel(matchPercentage)}
              </p>
            </div>
            <div className={`text-5xl font-bold ${getMatchColor(matchPercentage)}`}>
              {matchPercentage}%
            </div>
          </div>
          <Progress value={matchPercentage} className="h-3" />
        </div>

        {/* Headline */}
        {analysis_json.headline && (
          <div className="flex gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <TrendingUp className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-blue-900 mb-1">AI Summary</h4>
              <p className="text-blue-800">{analysis_json.headline}</p>
            </div>
          </div>
        )}

        {/* Agent Insight */}
        {analysis_json.agent_insight && (
          <div className="p-4 bg-white rounded-lg border">
            <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Info className="h-4 w-4 text-gray-600" />
              Agent Insight
            </h4>
            <p className="text-gray-700">{analysis_json.agent_insight}</p>
          </div>
        )}

        {/* Why It Works */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Why This Property Works
          </h4>
          <div className="space-y-3">
            {analysis_json.why_it_works.budget && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <span className="font-medium text-green-900">Budget: </span>
                    <span className="text-green-800">
                      {analysis_json.why_it_works.budget}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {analysis_json.why_it_works.location && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <span className="font-medium text-green-900">Location: </span>
                    <span className="text-green-800">
                      {analysis_json.why_it_works.location}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {(analysis_json.why_it_works.lifestyle_fit ||
              analysis_json.why_it_works.family_fit ||
              analysis_json.why_it_works.investment_fit) && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <span className="font-medium text-green-900">Lifestyle: </span>
                    <span className="text-green-800">
                      {analysis_json.why_it_works.lifestyle_fit ||
                        analysis_json.why_it_works.family_fit ||
                        analysis_json.why_it_works.investment_fit}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dealbreaker Flags */}
        {analysis_json.dealbreaker_flags &&
          analysis_json.dealbreaker_flags.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <h4 className="font-semibold mb-2">Potential Concerns</h4>
                <ul className="list-disc list-inside space-y-1">
                  {analysis_json.dealbreaker_flags.map((flag, index) => (
                    <li key={index}>{flag}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

        {/* Considerations */}
        {analysis_json.considerations &&
          analysis_json.considerations.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Info className="h-4 w-4 text-gray-600" />
                Things to Consider
              </h4>
              <ul className="space-y-2">
                {analysis_json.considerations.map((consideration, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span className="text-gray-700">{consideration}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        {/* Score Breakdown */}
        {analysis_json.score_breakdown &&
          Object.keys(analysis_json.score_breakdown).length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">
                Score Breakdown
              </h4>
              <div className="space-y-3">
                {Object.entries(analysis_json.score_breakdown).map(
                  ([key, value]) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700 capitalize">
                          {key.replace(/_/g, " ")}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {value}/10
                        </span>
                      </div>
                      <Progress value={(value / 10) * 100} className="h-2" />
                    </div>
                  )
                )}
              </div>
            </div>
          )}
      </CardContent>
    </Card>
  );
}

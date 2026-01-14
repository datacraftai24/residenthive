import { Card, CardContent } from "@/components/ui/card";

interface AIInsightsPanelProps {
  synthesis: {
    intro_paragraph?: string;
    ranking_intro?: string;
    persona_label?: string;
    lifestyle_needs?: string[];
  };
}

export function AIInsightsPanel({ synthesis }: AIInsightsPanelProps) {
  // Get the main content to display
  const mainContent = synthesis.intro_paragraph || synthesis.ranking_intro;

  if (!mainContent && !synthesis.persona_label && !synthesis.lifestyle_needs?.length) {
    return null;
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardContent className="p-4">
        {synthesis.persona_label && (
          <div className="mb-3 text-sm text-blue-800">
            <strong>Your Profile:</strong> {synthesis.persona_label}
          </div>
        )}
        {mainContent && (
          <p className="text-gray-700">{mainContent}</p>
        )}
        {synthesis.lifestyle_needs && synthesis.lifestyle_needs.length > 0 && (
          <div className="mt-3">
            <strong className="text-sm text-gray-600">Key priorities:</strong>
            <ul className="mt-1 list-disc list-inside text-gray-700 text-sm">
              {synthesis.lifestyle_needs.map((need, i) => (
                <li key={i}>{need}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

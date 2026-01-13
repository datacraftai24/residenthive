import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";

interface AIInsightsPanelProps {
  synthesis: {
    intro_paragraph?: string;
    ranking_intro?: string;
    persona_label?: string;
    lifestyle_needs?: string[];
  };
}

export function AIInsightsPanel({ synthesis }: AIInsightsPanelProps) {
  const [open, setOpen] = useState(false);

  // Get the main content to display
  const mainContent = synthesis.intro_paragraph || synthesis.ranking_intro;

  if (!mainContent && !synthesis.persona_label && !synthesis.lifestyle_needs?.length) {
    return null;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-blue-200 bg-blue-50/50">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-blue-100/50 transition-colors rounded-t-lg">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-blue-900">
                AI Insights - Why these properties match you
              </span>
            </div>
            <ChevronDown
              className={`h-5 w-5 text-blue-600 transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
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
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Brain, User, Clock, DollarSign, MessageSquare, Target } from "lucide-react";

interface Tag {
  tag: string;
  category: string;
  confidence: number;
  source: string;
}

interface Persona {
  emotionalTone?: string;
  communicationStyle?: string;
  decisionMakingStyle?: string;
  urgencyLevel: number;
  priceOrientation?: string;
  personalityTraits: string[];
  confidenceScore: number;
}

interface TagPersonaDisplayProps {
  tags: Tag[];
  persona: Persona;
  className?: string;
}

export default function TagPersonaDisplay({ tags, persona, className }: TagPersonaDisplayProps) {
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'demographic':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'behavioral':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'preference':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'urgency':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'financial':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getUrgencyColor = (level: number) => {
    if (level >= 70) return "text-red-600 dark:text-red-400";
    if (level >= 40) return "text-yellow-600 dark:text-yellow-400";
    return "text-green-600 dark:text-green-400";
  };

  const groupedTags = tags.reduce((acc, tag) => {
    if (!acc[tag.category]) acc[tag.category] = [];
    acc[tag.category].push(tag);
    return acc;
  }, {} as Record<string, Tag[]>);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* AI-Generated Tags */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5" />
            AI-Generated Tags
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(groupedTags).map(([category, categoryTags]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2 capitalize">
                {category}
              </h4>
              <div className="flex flex-wrap gap-2">
                {categoryTags.map((tag, index) => (
                  <Badge
                    key={index}
                    className={getCategoryColor(tag.category)}
                    variant="secondary"
                  >
                    {tag.tag}
                    <span className="ml-1 text-xs opacity-75">
                      {tag.confidence}%
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          {tags.length === 0 && (
            <p className="text-sm text-muted-foreground">No tags generated yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Persona Analysis */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5" />
            Persona Analysis
            <Badge variant="outline" className="ml-auto">
              {persona.confidenceScore}% confidence
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Communication & Decision Making */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Communication Style</span>
              </div>
              <Badge variant="outline" className="capitalize">
                {persona.communicationStyle || 'Not determined'}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Decision Making</span>
              </div>
              <Badge variant="outline" className="capitalize">
                {persona.decisionMakingStyle || 'Not determined'}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Urgency & Price Orientation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Urgency Level</span>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={persona.urgencyLevel} className="flex-1 h-2" />
                <span className={`text-sm font-medium ${getUrgencyColor(persona.urgencyLevel)}`}>
                  {persona.urgencyLevel}%
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Price Orientation</span>
              </div>
              <Badge variant="outline" className="capitalize">
                {persona.priceOrientation || 'Not determined'}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Emotional Tone & Personality Traits */}
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium">Emotional Tone:</span>
              <Badge variant="secondary" className="ml-2 capitalize">
                {persona.emotionalTone || 'Neutral'}
              </Badge>
            </div>

            {persona.personalityTraits.length > 0 && (
              <div>
                <span className="text-sm font-medium mb-2 block">Personality Traits:</span>
                <div className="flex flex-wrap gap-2">
                  {persona.personalityTraits.map((trait, index) => (
                    <Badge key={index} variant="outline" className="capitalize">
                      {trait}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
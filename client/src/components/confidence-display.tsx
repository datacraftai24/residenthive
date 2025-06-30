import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Mic, Type, FormInput } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfidenceDisplayProps {
  confidence: number;
  inputMethod: 'voice' | 'text' | 'form';
  fieldName?: string;
  className?: string;
}

export default function ConfidenceDisplay({ 
  confidence, 
  inputMethod, 
  fieldName,
  className 
}: ConfidenceDisplayProps) {
  const getConfidenceColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getConfidenceLevel = (score: number) => {
    if (score >= 80) return "High";
    if (score >= 60) return "Medium";
    return "Low";
  };

  const getInputMethodIcon = (method: string) => {
    switch (method) {
      case 'voice':
        return <Mic className="h-3 w-3" />;
      case 'text':
        return <Type className="h-3 w-3" />;
      case 'form':
        return <FormInput className="h-3 w-3" />;
      default:
        return <AlertCircle className="h-3 w-3" />;
    }
  };

  const getInputMethodLabel = (method: string) => {
    switch (method) {
      case 'voice':
        return 'Voice Input';
      case 'text':
        return 'Text Input';
      case 'form':
        return 'Form Input';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className={cn("flex items-center gap-2 text-sm", className)}>
      {/* Input Method Badge */}
      <Badge variant="outline" className="flex items-center gap-1 text-xs">
        {getInputMethodIcon(inputMethod)}
        {getInputMethodLabel(inputMethod)}
      </Badge>
      
      {/* Confidence Score */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          Confidence:
        </span>
        <div className="flex items-center gap-1">
          <Progress 
            value={confidence} 
            className="w-12 h-2" 
          />
          <span className={cn("text-xs font-medium", getConfidenceColor(confidence))}>
            {confidence}%
          </span>
        </div>
        <Badge 
          variant={confidence >= 80 ? "default" : confidence >= 60 ? "secondary" : "destructive"}
          className="text-xs"
        >
          {getConfidenceLevel(confidence)}
        </Badge>
      </div>

      {fieldName && confidence < 60 && (
        <div className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
          <AlertCircle className="h-3 w-3" />
          <span>Review {fieldName}</span>
        </div>
      )}
    </div>
  );
}
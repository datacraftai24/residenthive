import { Badge } from "@/components/ui/badge";

interface LeadOriginBadgeProps {
  source: string;
  className?: string;
}

const sourceConfig: Record<string, { bg: string; text: string; label: string }> = {
  zillow: { bg: "bg-blue-100", text: "text-blue-800", label: "Zillow" },
  redfin: { bg: "bg-red-100", text: "text-red-800", label: "Redfin" },
  google: { bg: "bg-green-100", text: "text-green-800", label: "Google" },
  referral: { bg: "bg-purple-100", text: "text-purple-800", label: "Referral" },
  unknown: { bg: "bg-gray-100", text: "text-gray-800", label: "Lead" },
};

export function LeadOriginBadge({ source, className = "" }: LeadOriginBadgeProps) {
  const config = sourceConfig[(source || "").toLowerCase()] || sourceConfig.unknown;

  return (
    <Badge
      variant="outline"
      className={`${config.bg} ${config.text} border-0 text-xs font-medium ${className}`}
    >
      From {config.label}
    </Badge>
  );
}

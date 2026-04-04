import { SchoolDataCard } from "./SchoolDataCard";
import { ComparisonCard } from "./ComparisonCard";
import { TransitCard } from "./TransitCard";
import { PriceHistoryCard } from "./PriceHistoryCard";

interface StructuredDataCardProps {
  data: Record<string, any>;
}

export function StructuredDataCard({ data }: StructuredDataCardProps) {
  switch (data.type) {
    case "schools":
      return <SchoolDataCard data={data as any} />;
    case "comparison":
      return <ComparisonCard data={data as any} />;
    case "transit":
      return <TransitCard data={data as any} />;
    case "price_history":
      return <PriceHistoryCard data={data as any} />;
    default:
      return null;
  }
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  DollarSign,
  Bed,
  Bath,
  Maximize,
  Car,
  GraduationCap,
  TreePine,
  AlertTriangle,
  Star,
  Calendar,
  CalendarDays
} from "lucide-react";
import React from "react";

interface ComparisonRow {
  id: string;
  label: string;
  icon: string;
  type: string;
  values: Record<string, {
    value: number | string;
    display: string;
    subtext?: string;
    flag?: string;
    is_best?: boolean;
  }>;
}

interface ListingHeader {
  mlsNumber: string;
  address: string;
  city: string;
  image: string | null;
  rank: number;
  label: string;
}

interface RichComparison {
  rows: ComparisonRow[];
  listings: ListingHeader[];
}

interface ComparisonTableProps {
  comparison: RichComparison;
  onRequestShowing: (mlsNumber: string) => void;
  onViewDetails: (mlsNumber: string) => void;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "trophy": Trophy,
  "dollar-sign": DollarSign,
  "bed": Bed,
  "bath": Bath,
  "maximize": Maximize,
  "car": Car,
  "graduation-cap": GraduationCap,
  "trees": TreePine,
  "calendar": CalendarDays,
  "alert-triangle": AlertTriangle,
  "star": Star,
};

export function ComparisonTable({ comparison, onRequestShowing, onViewDetails }: ComparisonTableProps) {
  const { rows, listings } = comparison;

  if (!rows || !listings || listings.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full border-collapse bg-white">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="p-4 text-left font-semibold text-gray-700 bg-gray-50 sticky left-0 z-10 min-w-[120px]">
              Compare
            </th>
            {listings.map((listing) => (
              <th key={listing.mlsNumber} className="p-3 text-center min-w-[150px]">
                <div className="flex flex-col items-center gap-2">
                  <Badge
                    className={
                      listing.rank === 1
                        ? "bg-green-600 text-white"
                        : listing.rank === 2
                          ? "bg-blue-600 text-white"
                          : "bg-gray-600 text-white"
                    }
                  >
                    #{listing.rank} {listing.label}
                  </Badge>
                  {listing.image && (
                    <img
                      src={listing.image}
                      alt={listing.address}
                      className="w-20 h-16 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => onViewDetails(listing.mlsNumber)}
                    />
                  )}
                  <span className="text-xs text-gray-600 text-center line-clamp-2">
                    {listing.address}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, rowIdx) => {
            const Icon = ICONS[row.icon] || Star;
            const isMatchScore = row.id === "match_score";

            return (
              <tr
                key={row.id}
                className={`
                  ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  ${isMatchScore ? "bg-blue-50" : ""}
                `}
              >
                {/* Row Label */}
                <td className="p-3 font-medium text-gray-700 sticky left-0 bg-inherit z-10 border-r border-gray-200">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    <span className="text-sm">{row.label}</span>
                  </div>
                </td>

                {/* Values */}
                {listings.map((listing) => {
                  const cell = row.values[listing.mlsNumber];
                  if (!cell) {
                    return (
                      <td key={listing.mlsNumber} className="p-3 text-center text-gray-400">
                        —
                      </td>
                    );
                  }

                  return (
                    <td key={listing.mlsNumber} className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {/* Main Value */}
                        <span
                          className={`
                            font-medium text-sm
                            ${cell.is_best ? "text-green-700" : "text-gray-900"}
                            ${isMatchScore ? "text-base" : ""}
                          `}
                        >
                          {cell.display}
                          {cell.is_best && <span className="ml-1">⭐</span>}
                        </span>

                        {/* Match Score Progress Bar */}
                        {isMatchScore && typeof cell.value === "number" && (
                          <div className="w-full max-w-[100px] bg-gray-200 rounded-full h-2 mt-1">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(cell.value, 100)}%` }}
                            />
                          </div>
                        )}

                        {/* Subtext */}
                        {cell.subtext && (
                          <span className="text-xs text-gray-500">{cell.subtext}</span>
                        )}

                        {/* Warning Flag */}
                        {cell.flag === "warning" && (
                          <span className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Over limit
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {/* Action Row */}
          <tr className="border-t-2 border-gray-200 bg-gray-50">
            <td className="p-3 font-medium text-gray-700 sticky left-0 bg-gray-50 z-10 border-r border-gray-200">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="text-sm">Actions</span>
              </div>
            </td>
            {listings.map((listing) => (
              <td key={listing.mlsNumber} className="p-3 text-center">
                <Button
                  size="sm"
                  onClick={() => onRequestShowing(listing.mlsNumber)}
                  className="w-full max-w-[120px]"
                >
                  <Calendar className="h-4 w-4 mr-1" />
                  Schedule
                </Button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

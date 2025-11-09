import { DollarSign, TrendingUp, Percent, Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PropertyInsights {
  estimated_rental: number | null;
  price_per_sqft: number | null;
  investment_summary: string | null;
  risk_factors: string[] | null;
  market_trends: Record<string, any> | null;
  cap_rate: number | null;
  roi_estimate: number | null;
}

interface Property {
  price: number;
  square_feet: number;
}

interface InvestmentMetricsProps {
  insights: PropertyInsights;
  property: Property;
}

export default function InvestmentMetrics({
  insights,
  property,
}: InvestmentMetricsProps) {
  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return "N/A";
    return `${value.toFixed(2)}%`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Investment Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-4">
          {/* Price per Sq Ft */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium">Price / Sq Ft</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {insights.price_per_sqft
                ? `$${insights.price_per_sqft.toFixed(0)}`
                : property.square_feet
                ? `$${(property.price / property.square_feet).toFixed(0)}`
                : "N/A"}
            </div>
          </div>

          {/* Estimated Rental */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium">Est. Rental</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(insights.estimated_rental)}
              {insights.estimated_rental && (
                <span className="text-sm text-gray-600 font-normal">/mo</span>
              )}
            </div>
          </div>

          {/* Cap Rate */}
          {insights.cap_rate !== null && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <Percent className="h-4 w-4" />
                <span className="text-xs font-medium">Cap Rate</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {formatPercent(insights.cap_rate)}
              </div>
            </div>
          )}

          {/* ROI Estimate */}
          {insights.roi_estimate !== null && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs font-medium">ROI Estimate</span>
              </div>
              <div className="text-2xl font-bold text-green-600">
                {formatPercent(insights.roi_estimate)}
              </div>
            </div>
          )}
        </div>

        {/* Investment Summary */}
        {insights.investment_summary && (
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-2 text-sm">
              Investment Summary
            </h4>
            <p className="text-sm text-blue-800">{insights.investment_summary}</p>
          </div>
        )}

        {/* Risk Factors */}
        {insights.risk_factors && insights.risk_factors.length > 0 && (
          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <h4 className="font-semibold text-yellow-900 mb-2 text-sm">
              Risk Factors
            </h4>
            <ul className="space-y-1">
              {insights.risk_factors.map((risk, index) => (
                <li key={index} className="text-sm text-yellow-800 flex items-start gap-2">
                  <span className="text-yellow-600 mt-1">•</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Market Trends */}
        {insights.market_trends && Object.keys(insights.market_trends).length > 0 && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-semibold text-gray-900 mb-3 text-sm">
              Market Trends
            </h4>
            <div className="space-y-2">
              {Object.entries(insights.market_trends).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 capitalize">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="font-medium text-gray-900">
                    {typeof value === "number"
                      ? value.toFixed(1)
                      : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Monthly Payment Estimate */}
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <h4 className="font-semibold text-green-900 mb-2 text-sm">
            Est. Monthly Payment
          </h4>
          <div className="text-3xl font-bold text-green-900">
            {formatCurrency(Math.round((property.price * 0.005)))}
            <span className="text-sm text-green-700 font-normal">/mo</span>
          </div>
          <p className="text-xs text-green-700 mt-1">
            Based on 20% down, 7% APR, 30-year fixed
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

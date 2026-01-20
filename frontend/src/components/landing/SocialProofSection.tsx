import { Clock, DollarSign, MapPin, Quote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const metrics = [
  {
    icon: Clock,
    value: "~15 min",
    label: "saved per listing",
  },
  {
    icon: DollarSign,
    value: "$100+",
    label: "lead cost protected",
  },
  {
    icon: MapPin,
    value: "Toronto",
    label: "pilot market",
  },
];

export function SocialProofSection() {
  return (
    <section className="py-16 sm:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Metrics */}
        <div className="grid sm:grid-cols-3 gap-6 mb-16">
          {metrics.map((metric, index) => (
            <Card key={index} className="border-gray-200 text-center">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-4">
                  <metric.icon className="h-6 w-6 text-teal-600" />
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">
                  {metric.value}
                </div>
                <div className="text-gray-600">{metric.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quote */}
        <div className="max-w-2xl mx-auto">
          <Card className="border-teal-200 bg-teal-50/50">
            <CardContent className="pt-6">
              <Quote className="h-8 w-8 text-teal-400 mb-4" />
              <blockquote className="text-xl text-gray-700 mb-4 italic">
                "This saves me ~15 minutes per listing."
              </blockquote>
              <p className="text-gray-500">— Agent (demo)</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

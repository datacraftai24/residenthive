import { Sparkles, MessageCircle, Target, Link } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Sparkles,
    title: "Curated Top-5",
    description: "Instead of 40 listings, buyers get 5 ranked picks with clear explanations of why each fits.",
  },
  {
    icon: MessageCircle,
    title: "Async Engagement",
    description: "Buyers engage on their schedule. AI handles follow-up within brokerage-controlled parameters.",
  },
  {
    icon: Target,
    title: "Automatic Intent Capture",
    description: "No forms. Natural conversation reveals timeline, budget, and preferences automatically.",
  },
  {
    icon: Link,
    title: "One Link, Zero Threads",
    description: "Replace the 10-message email thread with a single shareable link.",
  },
];

export function SolutionSection() {
  return (
    <section id="features" className="py-16 sm:py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            A smarter first response
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            ResidenceHive transforms how brokerages engage leads from the first touchpoint.
          </p>
        </div>

        {/* Feature Cards - 2x2 Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="border-gray-200 hover:border-teal-200 hover:shadow-md transition-all">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-lg bg-teal-50 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-teal-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

import { DollarSign, MessageSquareX, ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const problems = [
  {
    icon: DollarSign,
    title: "Expensive, Ignored",
    description: "Brokerages pay $100-225+ per lead. Most never get a meaningful response.",
  },
  {
    icon: MessageSquareX,
    title: "Generic Replies",
    description: "Buyers get 30-40 unranked listings with no explanation or trade-offs. It looks like spam.",
  },
  {
    icon: ClipboardList,
    title: "Lost Intent",
    description: "Buyer questions reveal timeline, budget, must-haves. Traditional CRMs capture none of it.",
  },
];

export function ProblemSection() {
  return (
    <section className="py-16 sm:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            The problem with lead response today
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Real estate leads are expensive, but most brokerages struggle to respond effectively.
          </p>
        </div>

        {/* Problem Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {problems.map((problem, index) => (
            <Card key={index} className="border-gray-200 hover:border-gray-300 transition-colors">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center mb-4">
                  <problem.icon className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {problem.title}
                </h3>
                <p className="text-gray-600">
                  {problem.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

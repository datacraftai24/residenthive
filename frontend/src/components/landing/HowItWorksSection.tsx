import { ArrowRight, Inbox, Brain, FileText, MessageSquare, UserCheck } from "lucide-react";

const steps = [
  {
    icon: Inbox,
    number: 1,
    title: "Lead Arrives",
    description: "From website, Zillow, Realtor.com, or referral",
  },
  {
    icon: Brain,
    number: 2,
    title: "AI Analyzes",
    description: "Extracts budget, timeline, must-haves, dealbreakers",
  },
  {
    icon: FileText,
    number: 3,
    title: "Report Generated",
    description: "Curated Top-5 with personalized explanations",
  },
  {
    icon: MessageSquare,
    number: 4,
    title: "Buyer Engages",
    description: "Chatbot answers questions within compliance guardrails",
  },
  {
    icon: UserCheck,
    number: 5,
    title: "Agent Acts",
    description: "Receive qualified lead with full context - ready for action",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-16 sm:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            How it works
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            From lead to qualified buyer in five seamless steps.
          </p>
        </div>

        {/* Desktop Flow - Horizontal */}
        <div className="hidden lg:flex items-start justify-between">
          {steps.map((step, index) => (
            <div key={index} className="flex items-start">
              {/* Step */}
              <div className="flex flex-col items-center text-center max-w-[180px]">
                <div className="w-16 h-16 rounded-full bg-teal-600 flex items-center justify-center mb-4 relative">
                  <step.icon className="h-8 w-8 text-white" />
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-gray-600">
                  {step.description}
                </p>
              </div>

              {/* Arrow (except last) */}
              {index < steps.length - 1 && (
                <div className="flex-shrink-0 pt-6 px-4">
                  <ArrowRight className="h-6 w-6 text-gray-300" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Mobile Flow - Vertical */}
        <div className="lg:hidden space-y-8">
          {steps.map((step, index) => (
            <div key={index} className="flex gap-4">
              {/* Step Number and Line */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center relative flex-shrink-0">
                  <step.icon className="h-6 w-6 text-white" />
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {step.number}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className="w-0.5 h-full bg-gray-200 mt-2" />
                )}
              </div>

              {/* Content */}
              <div className="pb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {step.title}
                </h3>
                <p className="text-gray-600">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

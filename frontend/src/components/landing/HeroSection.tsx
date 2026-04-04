import { useState } from "react";
import { ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DemoRequestModal } from "./DemoRequestModal";
import ResidenceHiveDemo from "./ResidenceHiveDemo";

export function HeroSection() {
  const [demoModalOpen, setDemoModalOpen] = useState(false);

  return (
    <section id="how-it-works" className="relative min-h-screen flex items-center pt-16 bg-gradient-to-br from-teal-50 to-cyan-100 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">

          {/* Left — Content */}
          <div className="text-center lg:text-left">
            <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm bg-white/80 text-teal-700 border border-teal-200">
              Now in private pilot
            </Badge>

            <h1 className="text-4xl sm:text-5xl lg:text-4xl xl:text-5xl font-bold text-gray-900 tracking-tight mb-5">
              Your buyers deserve better than a listing dump
            </h1>

            <p className="text-base sm:text-lg text-gray-600 mb-4 leading-relaxed">
              Leads go cold because agents send 50 listings and hope for the best.
              ResidenceHive sends a personalized buyer report — properties ranked by
              their criteria, AI photo analysis that catches what agents miss, and
              honest market explanations that build trust.
            </p>

            <p className="text-base sm:text-lg font-semibold text-gray-800 mb-6">
              Buyers respond because someone finally did the work. Agents close more
              because buyers show up informed and ready to tour.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-6">
              <Button
                size="lg"
                className="text-base px-7 py-5 h-auto bg-gray-900 hover:bg-gray-800"
                onClick={() => setDemoModalOpen(true)}
              >
                Request demo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            {/* Math comparison card */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 p-4 max-w-lg">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                The math your brokerage is living
              </p>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600 line-through decoration-2">$50-80</div>
                  <div className="text-xs text-gray-500">per lead</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600 line-through decoration-2">0.5%</div>
                  <div className="text-xs text-gray-500">convert with listing dumps</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600 line-through decoration-2">$16,000</div>
                  <div className="text-xs text-gray-500">lead cost per closing</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-100">
                <div className="text-center">
                  <div className="text-lg font-bold text-green-700">60s</div>
                  <div className="text-xs text-gray-500">response time</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-700">2-4%</div>
                  <div className="text-xs text-gray-500">convert with personalized reports</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-700">$2,000</div>
                  <div className="text-xs text-gray-500">lead cost per closing</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-sm text-gray-600">
                No CRM login. No new workflow. Voice note on WhatsApp → report in their inbox.
              </span>
            </div>
          </div>

          {/* Right — Demo */}
          <div className="hidden lg:flex justify-center lg:justify-end">
            <ResidenceHiveDemo />
          </div>

        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent" />

      <DemoRequestModal open={demoModalOpen} onOpenChange={setDemoModalOpen} />
    </section>
  );
}

import { useState } from "react";
import { ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DemoRequestModal } from "./DemoRequestModal";

export function HeroSection() {
  const [demoModalOpen, setDemoModalOpen] = useState(false);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="relative min-h-screen flex items-center pt-16 bg-gradient-to-br from-teal-50 to-cyan-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm bg-white/80 text-teal-700 border border-teal-200">
            Now in Private Pilot
          </Badge>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight mb-6">
            The first-response layer{" "}
            <span className="text-teal-600">for real estate</span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl sm:text-2xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Transform generic lead responses into curated, compliant buyer engagement that converts.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button
              size="lg"
              className="text-lg px-8 py-6 h-auto"
              onClick={() => setDemoModalOpen(true)}
            >
              Request Demo
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-6 h-auto bg-white/80"
              onClick={() => scrollToSection("how-it-works")}
            >
              See How It Works
            </Button>
          </div>

          {/* Stat */}
          <div className="inline-flex items-center gap-3 bg-white/60 backdrop-blur-sm rounded-full px-6 py-3 border border-gray-200">
            <AlertCircle className="h-5 w-5 text-teal-600" />
            <span className="text-gray-700">
              <span className="font-semibold text-gray-900">78% of real estate leads</span> never receive a personalized response.
            </span>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent" />

      {/* Demo Request Modal */}
      <DemoRequestModal open={demoModalOpen} onOpenChange={setDemoModalOpen} />
    </section>
  );
}

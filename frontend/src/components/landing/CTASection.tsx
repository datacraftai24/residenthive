import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoRequestModal } from "./DemoRequestModal";

export function CTASection() {
  const [demoModalOpen, setDemoModalOpen] = useState(false);

  return (
    <section className="py-16 sm:py-24 bg-teal-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Ready to transform your lead response?
        </h2>
        <p className="text-xl text-teal-100 mb-8 max-w-2xl mx-auto">
          Join the private pilot and see ResidenceHive in action.
        </p>

        <Button
          size="lg"
          variant="secondary"
          className="text-lg px-8 py-6 h-auto bg-white text-teal-600 hover:bg-teal-50"
          onClick={() => setDemoModalOpen(true)}
        >
          Request Demo
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>

        <p className="mt-6 text-teal-200 text-sm">
          $100/seat/month | No long-term contracts
        </p>
      </div>

      {/* Demo Request Modal */}
      <DemoRequestModal open={demoModalOpen} onOpenChange={setDemoModalOpen} />
    </section>
  );
}

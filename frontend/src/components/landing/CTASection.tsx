import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function CTASection() {
  return (
    <section className="py-20 bg-gradient-to-b from-white to-[#f0fdfa]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#111827] mb-4">
          Ready to transform your workflow?
        </h2>
        <p className="text-[#6b7280] text-lg mb-8">
          Join the private pilot — 60 days free, no contracts.
        </p>
        <Link href="/sign-up">
          <Button size="lg" className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg px-8 py-3 text-base">
            Request Demo — Pilots are free for 60 days
          </Button>
        </Link>
      </div>
    </section>
  );
}

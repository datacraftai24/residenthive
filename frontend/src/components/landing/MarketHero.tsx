import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface MarketHeroProps {
  badge?: string;
  headline: string;
  subhead: string;
  statCallout?: string;
  ctaText?: string;
  ctaHref?: string;
}

export function MarketHero({
  badge,
  headline,
  subhead,
  statCallout,
  ctaText = "Request Demo",
  ctaHref = "/sign-up",
}: MarketHeroProps) {
  return (
    <section className="pt-28 pb-16 bg-gradient-to-b from-[#f0fdfa] to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {badge && (
          <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium text-teal-700 bg-[#f0fdfa] border border-[#99f6e8] mb-6">
            {badge}
          </span>
        )}
        <h1 className="text-4xl sm:text-5xl font-bold text-[#111827] leading-tight mb-6">
          {headline}
        </h1>
        <p className="text-lg text-[#6b7280] max-w-2xl mx-auto mb-8">
          {subhead}
        </p>
        {statCallout && (
          <p className="text-teal-600 font-semibold text-lg mb-8">{statCallout}</p>
        )}
        <Link href={ctaHref}>
          <Button size="lg" className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg px-8 py-3 text-base">
            {ctaText}
          </Button>
        </Link>
      </div>
    </section>
  );
}

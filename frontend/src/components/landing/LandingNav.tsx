import { useState } from "react";
import { Link } from "wouter";
import { Building2, Menu, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [marketsOpen, setMarketsOpen] = useState(false);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
    setOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-teal-600" />
            <span className="font-semibold text-xl text-gray-900">ResidenceHive</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {/* Markets Dropdown */}
            <div
              className="relative group"
              onMouseEnter={() => setMarketsOpen(true)}
              onMouseLeave={() => setMarketsOpen(false)}
            >
              <button className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors">
                Markets <ChevronDown className="h-4 w-4" />
              </button>
              {marketsOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-2">
                  <a
                    href="/massachusetts"
                    className="block px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    Massachusetts
                  </a>
                  <a
                    href="/ontario"
                    className="block px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    Ontario
                  </a>
                </div>
              )}
            </div>
            <a href="/offer-bot" className="text-gray-600 hover:text-gray-900 transition-colors">
              Offer Bot
            </a>
            <button
              onClick={() => scrollToSection("how-it-works")}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              How It Works
            </button>
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-4">
            <a href="/sign-in">
              <Button variant="ghost">Sign In</Button>
            </a>
            <a href="/sign-up">
              <Button>Request Demo</Button>
            </a>
          </div>

          {/* Mobile Menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px]">
              <div className="flex flex-col gap-6 mt-8">
                {/* Markets expandable */}
                <div>
                  <button
                    onClick={() => setMarketsOpen(!marketsOpen)}
                    className="flex items-center gap-1 text-left text-lg text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Markets <ChevronDown className={`h-4 w-4 transition-transform ${marketsOpen ? "rotate-180" : ""}`} />
                  </button>
                  {marketsOpen && (
                    <div className="ml-4 mt-2 flex flex-col gap-2">
                      <a href="/massachusetts" className="text-gray-500 hover:text-gray-900">Massachusetts</a>
                      <a href="/ontario" className="text-gray-500 hover:text-gray-900">Ontario</a>
                    </div>
                  )}
                </div>
                <a href="/offer-bot" className="text-left text-lg text-gray-600 hover:text-gray-900 transition-colors">
                  Offer Bot
                </a>
                <button
                  onClick={() => scrollToSection("how-it-works")}
                  className="text-left text-lg text-gray-600 hover:text-gray-900 transition-colors"
                >
                  How It Works
                </button>
                <div className="border-t pt-6 flex flex-col gap-3">
                  <a href="/sign-in">
                    <Button variant="outline" className="w-full">Sign In</Button>
                  </a>
                  <a href="/sign-up">
                    <Button className="w-full">Request Demo</Button>
                  </a>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}

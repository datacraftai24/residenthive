import { useState } from "react";
import { Link } from "wouter";
import { Building2, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DemoRequestModal } from "./DemoRequestModal";

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
    setOpen(false);
  };

  const handleDemoClick = () => {
    setOpen(false);
    setDemoModalOpen(true);
  };

  return (
    <>
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
              <button
                onClick={() => scrollToSection("how-it-works")}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                How It Works
              </button>
              <button
                onClick={() => scrollToSection("features")}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Features
              </button>
              <button
                onClick={() => scrollToSection("differentiators")}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Why Us
              </button>
            </div>

            {/* Desktop CTAs */}
            <div className="hidden md:flex items-center gap-4">
              <a href="/sign-in">
                <Button variant="ghost">Sign In</Button>
              </a>
              <Button onClick={() => setDemoModalOpen(true)}>Request Demo</Button>
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
                  <button
                    onClick={() => scrollToSection("how-it-works")}
                    className="text-left text-lg text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    How It Works
                  </button>
                  <button
                    onClick={() => scrollToSection("features")}
                    className="text-left text-lg text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Features
                  </button>
                  <button
                    onClick={() => scrollToSection("differentiators")}
                    className="text-left text-lg text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Why Us
                  </button>
                  <div className="border-t pt-6 flex flex-col gap-3">
                    <a href="/sign-in">
                      <Button variant="outline" className="w-full">Sign In</Button>
                    </a>
                    <Button className="w-full" onClick={handleDemoClick}>
                      Request Demo
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      {/* Demo Request Modal */}
      <DemoRequestModal open={demoModalOpen} onOpenChange={setDemoModalOpen} />
    </>
  );
}

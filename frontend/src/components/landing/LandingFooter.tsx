import { Building2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export function LandingFooter() {
  return (
    <footer className="py-12 bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Logo and Links */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-white" />
            <span className="font-semibold text-lg text-white">ResidenceHive</span>
          </div>

          {/* Links */}
          <div className="flex gap-6 text-gray-400">
            <a
              href="mailto:hello@residencehive.com"
              className="hover:text-white transition-colors"
            >
              Contact
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Terms
            </a>
          </div>
        </div>

        <Separator className="my-8 bg-gray-800" />

        {/* Copyright */}
        <p className="text-center text-gray-500 text-sm">
          &copy; ResidenceHive {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}

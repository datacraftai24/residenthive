import { ArrowLeft, Shield, Scale, FileCheck, Brain, Building2, Home, AlertTriangle, Lock, Eye, UserCheck, ClipboardCheck } from "lucide-react";
import { Link } from "wouter";

interface ComplianceSection {
  icon: React.ReactNode;
  title: string;
  regulation: string;
  items: string[];
}

const sections: ComplianceSection[] = [
  {
    icon: <Shield className="h-5 w-5 text-blue-600" />,
    title: "Fair Housing",
    regulation: "Federal Fair Housing Act + Massachusetts Fair Housing Act (M.G.L. c. 151B)",
    items: [
      "All agents acknowledge Fair Housing compliance before accessing the platform",
      "Massachusetts protects 14+ classes including sexual orientation, gender identity, age, marital status, veteran status, genetic information, ancestry, and source of income",
      "Every buyer report includes a Fair Housing statement and Equal Housing Opportunity logo",
      "Schools displayed as count and distance only — no subjective quality judgments",
      "AI never generates commentary on neighborhoods, demographics, crime, or school quality",
      "Questions about crime, school quality, and neighborhood safety trigger a hard compliance freeze — the AI defers to the agent",
    ],
  },
  {
    icon: <Scale className="h-5 w-5 text-blue-600" />,
    title: "Agency Disclosure",
    regulation: "254 CMR 3.00(13)(a) — MA Mandatory Licensee-Consumer Relationship Disclosure",
    items: [
      "Every buyer report identifies the agent and their role as Buyer's Agent",
      "Compliance footer reminds buyers that Massachusetts law requires a written disclosure form",
      "Agents acknowledge this obligation during onboarding",
    ],
  },
  {
    icon: <FileCheck className="h-5 w-5 text-blue-600" />,
    title: "Buyer Representation Agreement",
    regulation: "NAR Settlement (effective August 17, 2024)",
    items: [
      "Every 'Request Showing' button displays a visible notice about the written buyer representation agreement requirement",
      "No showing can be initiated without the buyer seeing this notice",
      "Agents acknowledge this obligation during onboarding",
    ],
  },
  {
    icon: <Brain className="h-5 w-5 text-blue-600" />,
    title: "AI Transparency",
    regulation: "Best practice + anticipated MA Bill H.81",
    items: [
      "Every report includes an AI disclaimer identifying AI-generated content",
      "Property concerns include inline disclaimers advising independent verification",
      "Photo analysis notes that listing photos may not reflect current conditions",
      "AI chat assistant displays scope limitation — property information only, not professional advice",
      "Agents acknowledge that AI content requires their professional judgment",
    ],
  },
  {
    icon: <Building2 className="h-5 w-5 text-blue-600" />,
    title: "Broker Identification",
    regulation: "254 CMR 3.00(9)(a)",
    items: [
      "Every report displays the brokerage legal name and MA broker license number",
      "Agent name and contact information displayed alongside brokerage",
      "Reports cannot be generated until brokerage compliance fields are complete",
    ],
  },
  {
    icon: <Home className="h-5 w-5 text-blue-600" />,
    title: "MLS Data Compliance",
    regulation: "MLS Property Information Network, Inc. vendor agreement",
    items: [
      "Full MLS PIN data disclaimer on every report",
      "Data staleness notice informing consumers that listing status may have changed",
      "Report generation date displayed for transparency",
      "Data used solely for consumers with good faith interest in purchasing",
    ],
  },
  {
    icon: <AlertTriangle className="h-5 w-5 text-blue-600" />,
    title: "Lead Paint Disclosure",
    regulation: "MA Lead Law (M.G.L. c. 111 §§ 190-199B)",
    items: [
      "Properties built before 1978 display a prominent disclosure badge when buyer has children",
      "Deterministic trigger — no AI judgment involved",
      "Badge suppressed when data is unavailable (no false 'no risk' indication)",
    ],
  },
  {
    icon: <Lock className="h-5 w-5 text-blue-600" />,
    title: "Consumer Privacy",
    regulation: "MLS PIN requirements + privacy best practices",
    items: [
      "Privacy policy published and linked from every report",
      "Buyer notes sections include visibility notice",
      "We do not sell personal information",
      "We do not use consumer data to train AI models",
    ],
  },
  {
    icon: <Eye className="h-5 w-5 text-blue-600" />,
    title: "Consumer Protection",
    regulation: "M.G.L. c. 93A — Unfair and Deceptive Practices Act",
    items: [
      "AI assessments include disclaimers that they are not professional inspections",
      "No AI content presented as agent or brokerage representation",
      "All property concerns advise independent verification with qualified professionals",
    ],
  },
  {
    icon: <UserCheck className="h-5 w-5 text-blue-600" />,
    title: "Agent Onboarding Gate",
    regulation: "Platform policy",
    items: [
      "Every agent completes a four-part compliance acknowledgment before accessing the platform",
      "Covers Fair Housing, Agency Disclosure, Buyer Representation, and AI Disclosure",
      "Timestamped and stored — hard gate, no exceptions",
    ],
  },
  {
    icon: <ClipboardCheck className="h-5 w-5 text-blue-600" />,
    title: "Report Generation Gate",
    regulation: "Platform policy",
    items: [
      "Reports blocked until brokerage name, license, and jurisdiction are on file",
      "Agent name required for AI disclaimer attribution",
      "Brokerage compliance setup must be confirmed by administrator",
    ],
  },
];

export default function CompliancePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Back link */}
        <Link href="/">
          <button className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-8">
            <ArrowLeft className="h-4 w-4" />
            Back to ResidenceHive
          </button>
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Compliance</h1>
        <p className="text-gray-600 mb-8">
          ResidenceHive is built with regulatory compliance at its core. Every buyer report,
          AI-generated insight, and agent interaction is governed by the standards below.
        </p>

        <div className="space-y-8">
          {sections.map((section, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-2">
                {section.icon}
                <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
              </div>
              <p className="text-xs text-gray-500 mb-4">{section.regulation}</p>
              <ul className="space-y-2">
                {section.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-blue-500 mt-1 flex-shrink-0">-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="mt-12 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            For compliance questions, contact us at{" "}
            <a href="mailto:privacy@residencehive.com" className="text-blue-600 hover:underline">
              privacy@residencehive.com
            </a>
          </p>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          ResidenceHive &copy; {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}

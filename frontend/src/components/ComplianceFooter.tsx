interface ComplianceFooterProps {
  agentName: string;
  brokerageName?: string;
  brokerageLicense?: string;
  jurisdiction?: string;
}

function EHOLogo() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Equal Housing Opportunity"
    >
      <rect width="100" height="100" rx="4" fill="#1a1a1a" />
      <path d="M50 15L15 45H25V80H75V45H85L50 15Z" fill="white" />
      <rect x="35" y="50" width="30" height="4" fill="#1a1a1a" />
      <rect x="35" y="58" width="30" height="4" fill="#1a1a1a" />
      <rect x="35" y="66" width="30" height="4" fill="#1a1a1a" />
      <text
        x="50"
        y="95"
        textAnchor="middle"
        fill="white"
        fontSize="6"
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
      >
        EQUAL HOUSING OPPORTUNITY
      </text>
    </svg>
  );
}

const MLS_PIN_DISCLAIMER =
  "The property listing data and information set forth herein were provided to MLS Property Information Network, Inc. from third party sources, including sellers, lessors and public records, and were compiled by MLS Property Information Network, Inc. The property listing data and information are for the personal, non commercial use of consumers having a good faith interest in purchasing or leasing listed properties of the type displayed to them and may not be used for any purpose other than to identify prospective properties which such consumers may have a good faith interest in purchasing or leasing. MLS Property Information Network, Inc. and its subscribers disclaim any and all representations and warranties as to the accuracy of the property listing data and information set forth herein.";

export default function ComplianceFooter({
  agentName,
  brokerageName,
  brokerageLicense,
  jurisdiction,
}: ComplianceFooterProps) {
  return (
    <div className="mt-10">
      {/* Agency Disclosure Card (MA only) */}
      {jurisdiction === "MA" && (
        <div className="mb-6 border border-amber-200 bg-amber-50/50 rounded-lg p-4">
          <p className="text-sm text-amber-900">
            <strong>Agency Disclosure:</strong> Massachusetts law requires your
            agent to provide you with a Consumer Relationship Disclosure at the
            time of your first meeting to discuss a specific property. Contact{" "}
            {agentName} for details.
          </p>
        </div>
      )}

      {/* Compliance Footer */}
      <footer className="border-t border-gray-200 pt-6 pb-8 space-y-4">
        {/* EHO Logo + Brokerage */}
        <div className="flex items-start gap-4">
          <EHOLogo />
          <div className="space-y-1">
            {brokerageName ? (
              <>
                <p className="text-sm font-medium text-gray-700">
                  {brokerageName}
                </p>
                {brokerageLicense && (
                  <p className="text-xs text-gray-500">
                    MA License #{brokerageLicense}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400 italic">
                Brokerage information unavailable — contact your agent.
              </p>
            )}
          </div>
        </div>

        {/* AI Disclaimer */}
        <p className="text-xs text-gray-500 leading-relaxed">
          This report was prepared with the assistance of AI technology. All
          property data is sourced from MLS and public records. AI-generated
          insights are for informational purposes only and are subject to review
          by your agent, {agentName}.
        </p>

        {/* MLS PIN Disclaimer */}
        <p className="text-[11px] text-gray-400 leading-relaxed">
          {MLS_PIN_DISCLAIMER}
        </p>

        {/* Privacy + Powered by */}
        <div className="flex items-center justify-between pt-2">
          <a
            href="https://residencehive.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline"
          >
            Privacy Policy
          </a>
          <span className="text-xs text-gray-400">
            Powered by ResidenceHive
          </span>
        </div>
      </footer>
    </div>
  );
}

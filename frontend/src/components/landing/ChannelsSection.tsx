import { Smartphone, CheckCircle, Link2 } from "lucide-react";

function ChatMockup({
  platform,
  platformColor,
  platformIcon,
  agentMsg,
  botMsg,
  footerText,
}: {
  platform: string;
  platformColor: string;
  platformIcon: string;
  agentMsg: string;
  botMsg: string;
  footerText: string;
}) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="p-7 sm:p-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">{platformIcon}</span>
          <span className="font-semibold text-[#111827]">{platform}</span>
        </div>
        <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3 min-h-[180px]">
          {/* Agent bubble */}
          <div className="flex justify-end">
            <div className="bg-teal-600 text-white text-sm rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%]">
              {agentMsg}
            </div>
          </div>
          {/* Bot bubble */}
          <div className="flex justify-start">
            <div className="bg-white border border-[#e5e7eb] text-[#111827] text-sm rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%]">
              {botMsg}
            </div>
          </div>
          {/* Typing indicator */}
          <div className="flex justify-start">
            <div className="bg-white border border-[#e5e7eb] rounded-2xl rounded-bl-sm px-4 py-2.5">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        </div>
        {/* Footer badge */}
        <div className="mt-4 bg-[#f0fdfa] border border-[#99f6e8] rounded-lg px-4 py-2 text-center">
          <span className="text-teal-700 text-sm font-medium">⚡ {footerText}</span>
        </div>
      </div>
    </div>
  );
}

export function ChannelsSection() {
  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#111827] mb-4">
            Works where you already are
          </h2>
          <p className="text-[#6b7280] text-lg max-w-2xl mx-auto">
            No app to download. No portal to learn. Just message — on WhatsApp, iMessage, or SMS.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <ChatMockup
            platform="WhatsApp"
            platformColor="#25D366"
            platformIcon="💬"
            agentMsg="New buyer — 3 bed Newton, $1.2M budget, needs good schools, moving from Brookline"
            botMsg='Got it. Building buyer profile — budget $1.2M, 3-bed, Newton, school priority. Generating Top-5 report...'
            footerText="Buyer report generated in ~10 seconds"
          />
          <ChatMockup
            platform="iMessage / SMS"
            platformColor="#34C759"
            platformIcon="📱"
            agentMsg="123 Main St, offer at $950K, closing June 15, $25K deposit, financing condition"
            botMsg="Pulling property details for 123 Main St... Price, beds, baths ✓. Draft offer package ready for your review."
            footerText="Draft offer package ready for review"
          />
        </div>

        <div className="flex flex-wrap justify-center gap-8 mt-10 text-[#6b7280] text-sm">
          <span className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> No app to download</span>
          <span className="flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Works on any phone</span>
          <span className="flex items-center gap-2"><Link2 className="h-4 w-4" /> One number for everything</span>
        </div>
      </div>
    </section>
  );
}

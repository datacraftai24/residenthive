import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function PrivacyPage() {
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

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: April 2, 2026</p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Introduction</h2>
            <p className="text-gray-700 leading-relaxed">
              ResidenceHive, Inc. ("ResidenceHive," "we," "us," or "our") is committed to protecting the privacy
              of our users. This Privacy Policy explains how we collect, use, disclose, and safeguard your
              information when you use our platform, including our website at residencehive.com, buyer reports,
              AI-powered property analysis, and messaging integrations (collectively, the "Service").
            </p>
            <p className="text-gray-700 leading-relaxed mt-3">
              By using the Service, you agree to the collection and use of information in accordance with this policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Information We Collect</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2a. Information You Provide</h3>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Account information:</strong> Name, email address, phone number, brokerage affiliation, real estate license number.</li>
              <li><strong>Buyer preferences:</strong> Budget, desired locations, property type preferences, lifestyle priorities, and other home search criteria you share with your agent through the platform.</li>
              <li><strong>Communications:</strong> Messages, notes, and questions you submit through our buyer reports, AI assistant, or messaging integrations (WhatsApp, iMessage).</li>
              <li><strong>Showing requests:</strong> When you request a property showing, we collect the property details and your contact information to facilitate the request.</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2b. Information We Collect Automatically</h3>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Usage data:</strong> Pages viewed, features used, report engagement (e.g., which properties you viewed, time spent).</li>
              <li><strong>Device information:</strong> Browser type, operating system, IP address.</li>
              <li><strong>Cookies:</strong> We use essential cookies for authentication and session management. We do not use tracking cookies for advertising.</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2c. Information from Third Parties</h3>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>MLS data:</strong> Property listing data is sourced from MLS Property Information Network, Inc. (MLS PIN) and is used solely to provide property recommendations.</li>
              <li><strong>Authentication:</strong> If you sign up using a third-party service (e.g., email provider), we receive your name and email address from that service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Generate personalized buyer reports and property recommendations using AI analysis.</li>
              <li>Facilitate communication between you and your real estate agent.</li>
              <li>Process showing requests and other actions you initiate.</li>
              <li>Provide AI-powered insights about properties based on MLS data and public records.</li>
              <li>Ensure Fair Housing compliance and regulatory adherence.</li>
              <li>Improve and maintain the Service.</li>
              <li>Communicate with you about your account, reports, and platform updates.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. AI-Generated Content</h2>
            <p className="text-gray-700 leading-relaxed">
              ResidenceHive uses artificial intelligence to generate buyer briefs, property analysis, and compliance
              flags. AI-generated content is based on MLS listing data and public records. This content is for
              informational purposes only and is subject to review by your agent. ResidenceHive does not provide
              legal, financial, or real estate advice.
            </p>
            <p className="text-gray-700 leading-relaxed mt-3">
              We do not use your personal information to train AI models. Your data is used solely to generate
              personalized recommendations within the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Information Sharing</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              We do not sell your personal information. We share information only in the following circumstances:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>With your agent:</strong> Your buyer preferences, notes, questions, and engagement data are shared with the real estate agent associated with your report. This is necessary to provide the Service.</li>
              <li><strong>With your agent's brokerage:</strong> Your agent's brokerage may have access to aggregated pilot metrics (number of leads processed, reports sent) but not your individual data.</li>
              <li><strong>Service providers:</strong> We use third-party services for authentication (Clerk), email delivery (Mailjet), AI processing (OpenAI, Google), and MLS data (Repliers/MLS PIN). These providers process data on our behalf under contractual obligations.</li>
              <li><strong>Legal requirements:</strong> We may disclose information if required by law, regulation, or legal process.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Messaging Integrations</h2>
            <p className="text-gray-700 leading-relaxed">
              If your agent uses ResidenceHive's WhatsApp or iMessage integration, messages you send to your
              agent through these channels may be processed by ResidenceHive to provide AI-powered responses and
              manage your buyer profile. Your phone number serves as your identity for messaging purposes.
              Message content may be stored for compliance and service delivery purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. SMS & Messaging Consent</h2>
            <p className="text-gray-700 leading-relaxed">
              During onboarding, agents provide their phone number and explicitly consent to receive SMS and
              WhatsApp notifications from ResidenceHive. These notifications include lead alerts, buyer report
              delivery links, property price drop notifications, appointment reminders, and daily activity
              briefings. Messages may also be sent to buyers and leads on behalf of their agent, including
              property recommendations, report links, and follow-up communications.
            </p>
            <p className="text-gray-700 leading-relaxed mt-3">
              All messages are transactional and triggered by platform activity. We do not send marketing
              messages or share your phone number with third parties for promotional purposes.
            </p>
            <p className="text-gray-700 leading-relaxed mt-3">
              You may opt out of SMS notifications at any time by replying STOP to any message. You may also
              contact us at{" "}
              <a href="mailto:privacy@residencehive.com" className="text-blue-600 hover:underline">
                privacy@residencehive.com
              </a>{" "}
              to update your messaging preferences. Message and data rates may apply.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Data Security</h2>
            <p className="text-gray-700 leading-relaxed">
              We implement industry-standard security measures to protect your information, including encrypted
              data transmission (TLS/SSL), secure cloud infrastructure (Google Cloud Platform), and access
              controls. However, no method of transmission over the Internet is 100% secure, and we cannot
              guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Data Retention</h2>
            <p className="text-gray-700 leading-relaxed">
              We retain your information for as long as your account is active or as needed to provide the Service.
              Buyer reports and associated data are retained to ensure continued access to shared report links.
              You may request deletion of your data by contacting us at the address below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Your Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              Depending on your jurisdiction, you may have the right to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Access the personal information we hold about you.</li>
              <li>Request correction of inaccurate information.</li>
              <li>Request deletion of your personal information.</li>
              <li>Opt out of certain data processing activities.</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-3">
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:privacy@residencehive.com" className="text-blue-600 hover:underline">
                privacy@residencehive.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">11. MLS Data Usage</h2>
            <p className="text-gray-700 leading-relaxed">
              Property listing data is provided by MLS Property Information Network, Inc. This data is for the
              personal, non-commercial use of consumers having a good faith interest in purchasing or leasing
              listed properties and may not be used for any purpose other than to identify prospective properties
              consumers may be interested in purchasing or leasing. MLS Property Information Network, Inc. and
              its subscribers disclaim any and all representations and warranties as to the accuracy of the
              property listing data and information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Children's Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              The Service is not intended for individuals under the age of 18. We do not knowingly collect
              personal information from children. If we become aware that we have collected information from
              a child under 18, we will take steps to delete it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">13. Changes to This Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of material changes by
              posting the updated policy on this page with a revised "Last updated" date. Your continued use
              of the Service after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">14. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have questions about this Privacy Policy or our data practices, contact us at:
            </p>
            <div className="mt-3 text-gray-700">
              <p className="font-medium">ResidenceHive, Inc.</p>
              <p>Email: <a href="mailto:privacy@residencehive.com" className="text-blue-600 hover:underline">privacy@residencehive.com</a></p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
          ResidenceHive &copy; {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}

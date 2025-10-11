import { Building2 } from "lucide-react";
import { SignIn } from "@clerk/clerk-react";

export default function AgentLogin() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-white p-4 rounded-full shadow-lg">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Agent Portal</h1>
          <p className="text-gray-600">Sign in to your ResidentHive account</p>
        </div>

        <div className="bg-white shadow-xl border-0 rounded-lg p-4">
          <SignIn
            routing="path"
            path="/agent-login"
            signUpUrl="/sign-up"
            afterSignInUrl="/"
            redirectUrl="/"
          />
        </div>

        <div className="text-center mt-8 text-sm text-gray-500">
          <p>ResidentHive Agent Portal © 2024</p>
        </div>
      </div>
    </div>
  );
}

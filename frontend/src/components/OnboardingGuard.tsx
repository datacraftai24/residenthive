import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Building2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface OnboardingGuardProps {
  children: React.ReactNode;
}

interface OnboardingStatus {
  role: string;
  onboarding_complete: boolean;
  brokerage: {
    id: number;
    name: string;
    jurisdiction: string;
    verification_status: string;
    payment_status: string;
    confirmed: boolean;
  } | null;
  compliance_acknowledged: boolean;
  is_legacy_agent: boolean;
}

export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const [, setLocation] = useLocation();

  const { data: status, isLoading, error } = useQuery<OnboardingStatus>({
    queryKey: ["/api/onboarding/status"],
    staleTime: 30_000, // Cache for 30 seconds
    retry: 1,
  });

  useEffect(() => {
    if (isLoading || !status) return;

    // Check for pending invitation token — agent signed up but
    // hasn't completed the onboarding form yet
    const pendingToken = sessionStorage.getItem("rh_invitation_token");
    if (pendingToken && status.role === "agent" && !status.brokerage) {
      setLocation(`/onboard/agent?token=${pendingToken}`);
      return;
    }

    // Legacy agents skip all onboarding
    if (status.is_legacy_agent) return;

    // Admin always passes through
    if (status.role === "admin") return;

    // Agent needs compliance acknowledgment
    if (status.role === "agent" && !status.compliance_acknowledged) {
      setLocation("/onboard/compliance");
      return;
    }
  }, [status, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-white p-4 rounded-full shadow-lg">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  // If status failed to load, let them through (don't block on network errors)
  if (error || !status) {
    return <>{children}</>;
  }

  // Agent's brokerage is pending — show waiting message
  if (
    status.role === "agent" &&
    !status.is_legacy_agent &&
    status.brokerage &&
    status.brokerage.payment_status === "pending"
  ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Clock className="h-12 w-12 text-amber-500 mx-auto mb-2" />
            <CardTitle>Your Brokerage is Setting Up</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-gray-600">
            <p>
              {status.brokerage.name} is completing their setup. You'll be able to
              access the dashboard once they're ready.
            </p>
            <p className="mt-4 text-sm text-gray-500">
              Check back shortly or contact your broker of record.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

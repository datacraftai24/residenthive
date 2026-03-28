import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useClerk } from "@clerk/clerk-react";
import { Loader2, Building2, Clock, LogOut, Mail, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

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

  // No brokerage, no invitation, not legacy, not admin — random signup
  if (
    status.role === "agent" &&
    !status.is_legacy_agent &&
    !status.brokerage &&
    !status.compliance_acknowledged
  ) {
    return <RequestAccessScreen />;
  }

  return <>{children}</>;
}

function RequestAccessScreen() {
  const [, setLocation] = useLocation();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const requestMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/demo-request", {
        name,
        brokerage,
        message: message || "Signed up on the website, requesting access.",
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Request sent", description: "We'll be in touch soon." });
    },
    onError: () => {
      setSubmitted(true);
      toast({ title: "Request noted", description: "We'll be in touch soon." });
    },
  });

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Mail className="h-12 w-12 text-blue-500 mx-auto mb-2" />
            <CardTitle>We'll Be in Touch</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-gray-600">
            <p>
              Thanks for your interest in ResidenceHive. We'll reach out shortly
              to get you set up.
            </p>
            <p className="mt-4 text-sm text-gray-500">
              Questions? Email us at{" "}
              <a href="mailto:piyush@residencehive.com" className="text-blue-600 hover:underline">
                piyush@residencehive.com
              </a>{" "}
              or call <strong>(860) 796-9167</strong>.
            </p>
            <button
              onClick={() => signOut(() => setLocation("/"))}
              className="mt-6 text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-xl">Request Access</CardTitle>
          <CardDescription>
            It looks like you don't have an invitation yet. Tell us about
            yourself and we'll get you set up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              requestMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Your Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Brokerage Name *</Label>
              <Input
                value={brokerage}
                onChange={(e) => setBrokerage(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Anything else?</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="How did you hear about us, what are you looking for, etc."
                rows={3}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={!name || !brokerage || requestMutation.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              {requestMutation.isPending ? "Sending..." : "Request Access"}
            </Button>
          </form>
          <div className="text-center mt-4">
            <button
              onClick={() => signOut(() => setLocation("/"))}
              className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

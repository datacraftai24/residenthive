import { useState, useEffect } from "react";
import { SignUp } from "@clerk/clerk-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AuthLayout from "@/components/AuthLayout";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Send, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const INVITATION_TOKEN_KEY = "rh_invitation_token";

export default function SignUpPage() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const invitationToken = params.get("invitation_token");

  // Persist invitation token to sessionStorage so it survives
  // Clerk's multi-step signup flow (which strips query params
  // when navigating to /sign-up/verify-email-address)
  useEffect(() => {
    if (invitationToken) {
      sessionStorage.setItem(INVITATION_TOKEN_KEY, invitationToken);
    }
  }, [invitationToken]);

  // Read from URL first, fall back to sessionStorage
  const savedToken = invitationToken || sessionStorage.getItem(INVITATION_TOKEN_KEY);

  // If they have an invitation token, show Clerk signup
  if (savedToken) {
    const afterSignUpUrl = `/onboard/agent?token=${savedToken}`;
    return (
      <AuthLayout title="Join ResidenceHive" subtitle="Create your account to get started">
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          afterSignUpUrl={afterSignUpUrl}
          redirectUrl={afterSignUpUrl}
        />
      </AuthLayout>
    );
  }

  // No invitation — show request access form
  return <RequestAccessForm />;
}

function RequestAccessForm() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const requestMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/demo-request", {
        name,
        email,
        phone,
        brokerage,
        message: message || "Signed up on the website, requesting access.",
      });
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: () => {
      // Still show success — we don't want to block them
      setSubmitted(true);
    },
  });

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <CardTitle>We'll Be in Touch Within 24 Hours</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-gray-600">
            <p>
              Thank you for your interest in ResidenceHive! Due to real estate
              regulations, we verify every brokerage before activation.
            </p>
            <p className="mt-4 text-sm text-gray-500">
              Can't wait? Call or text Piyush directly at{" "}
              <a href="tel:+18607969167" className="text-blue-600 font-semibold hover:underline">
                (860) 796-9167
              </a>
            </p>
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
          <CardTitle className="text-2xl">Get Started with ResidenceHive</CardTitle>
          <CardDescription className="text-base mt-2">
            We're excited you're here! Due to real estate regulations, we need
            to verify your brokerage before activating your account. Our team
            will reach out within 24 hours.
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
                placeholder="Full name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@brokerage.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Phone *</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(617) 555-1234"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Brokerage Name *</Label>
              <Input
                value={brokerage}
                onChange={(e) => setBrokerage(e.target.value)}
                placeholder="Your brokerage"
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
              size="lg"
              disabled={!name || !email || !phone || !brokerage || requestMutation.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              {requestMutation.isPending ? "Sending..." : "Request Access"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

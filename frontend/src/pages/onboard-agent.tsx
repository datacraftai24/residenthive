import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@clerk/clerk-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InvitationData {
  valid: boolean;
  brokerage_name: string;
  jurisdiction: string;
  email: string;
  name: string | null;
  phone: string | null;
}

export default function OnboardAgentPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { isSignedIn, isLoaded } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Parse token from query params, fall back to sessionStorage
  const params = new URLSearchParams(searchString);
  const INVITATION_TOKEN_KEY = "rh_invitation_token";
  const token = params.get("token") || sessionStorage.getItem(INVITATION_TOKEN_KEY);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [designation, setDesignation] = useState("");
  const [coverageAreas, setCoverageAreas] = useState("");

  // Validate invitation token
  const {
    data: invitation,
    isLoading: invitationLoading,
    error: invitationError,
  } = useQuery<InvitationData>({
    queryKey: [`/api/onboarding/invitations/${token}`],
    enabled: !!token,
  });

  // Pre-fill from invitation data
  useEffect(() => {
    if (invitation) {
      if (invitation.name) {
        const parts = invitation.name.split(" ");
        setFirstName(parts[0] || "");
        setLastName(parts.slice(1).join(" ") || "");
      }
      if (invitation.phone) {
        // Strip +1 prefix if present for display
        const digits = invitation.phone.replace(/^\+1/, "");
        setPhoneDigits(digits);
      }
    }
  }, [invitation]);

  const onboardMutation = useMutation({
    mutationFn: async () => {
      const areas = coverageAreas
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);

      const res = await apiRequest("POST", "/api/onboarding/agent", {
        invitation_token: token,
        first_name: firstName,
        last_name: lastName,
        phone: `+1${phoneDigits.replace(/\D/g, "")}`,
        license_number: licenseNumber || null,
        designation: designation || null,
        coverage_areas: areas.length > 0 ? areas : null,
      });
      return res.json();
    },
    onSuccess: () => {
      sessionStorage.removeItem(INVITATION_TOKEN_KEY);
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      toast({
        title: "Welcome to ResidentHive!",
        description: "One more step — please complete the compliance acknowledgment.",
      });
      window.location.href = "/onboard/compliance";
    },
    onError: (error: Error) => {
      toast({
        title: "Onboarding failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Not signed in — redirect to signup with token
  if (isLoaded && !isSignedIn) {
    setLocation(`/sign-up?invitation_token=${token}`);
    return null;
  }

  // No token
  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
            <CardTitle>Invalid Link</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-gray-600">
            <p>This invitation link is missing a token. Please check the link from your email.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading invitation
  if (invitationLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Invalid/expired invitation
  if (invitationError || !invitation?.valid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
            <CardTitle>Invitation Expired</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-gray-600">
            <p>This invitation has expired or has already been used. Please contact your broker of record for a new invitation.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cleanDigits = phoneDigits.replace(/\D/g, "");
  const isFormValid = firstName && lastName && cleanDigits.length === 10;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">Complete Your Setup</CardTitle>
          <CardDescription className="text-base">
            You're joining <strong>{invitation.brokerage_name}</strong> on
            ResidentHive. Confirm your details below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onboardMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">
                  +1
                </span>
                <Input
                  id="phone"
                  className="rounded-l-none"
                  value={phoneDigits}
                  onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="6175551234"
                  required
                />
              </div>
              <p className="text-xs text-gray-500">
                We'll use this to connect you on WhatsApp and iMessage — no new app to download, just the phone you already use.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="licenseNumber">License Number</Label>
              <Input
                id="licenseNumber"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="designation">Designation</Label>
              <Select value={designation} onValueChange={setDesignation}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your designation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salesperson">Salesperson</SelectItem>
                  <SelectItem value="broker">Broker</SelectItem>
                  <SelectItem value="associate_broker">Associate Broker</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="coverageAreas">Coverage Areas</Label>
              <Input
                id="coverageAreas"
                value={coverageAreas}
                onChange={(e) => setCoverageAreas(e.target.value)}
                placeholder="Boston, Cambridge, Somerville"
              />
              <p className="text-xs text-gray-500">
                Comma-separated list of cities or regions you cover.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={!isFormValid || onboardMutation.isPending}
            >
              {onboardMutation.isPending ? "Setting up..." : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

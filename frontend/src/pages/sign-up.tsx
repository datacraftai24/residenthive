import { useEffect } from "react";
import { SignUp } from "@clerk/clerk-react";
import AuthLayout from "@/components/AuthLayout";
import { useSearch } from "wouter";

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

  const afterSignUpUrl = savedToken
    ? `/onboard/agent?token=${savedToken}`
    : "/dashboard";

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

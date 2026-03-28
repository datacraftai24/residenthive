import { SignIn } from "@clerk/clerk-react";
import AuthLayout from "@/components/AuthLayout";

export default function AgentLogin() {
  return (
    <AuthLayout title="Agent Portal" subtitle="Sign in to your ResidenceHive account">
      <SignIn
        routing="path"
        path="/agent-login"
        signUpUrl="/sign-up"
        afterSignInUrl="/"
        redirectUrl="/"
      />
    </AuthLayout>
  );
}

import { SignIn } from "@clerk/clerk-react";
import AuthLayout from "@/components/AuthLayout";

export default function SignInPage() {
  return (
    <AuthLayout title="Welcome Back" subtitle="Sign in to your ResidentHive account">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        afterSignInUrl="/dashboard"
        redirectUrl="/dashboard"
      />
    </AuthLayout>
  );
}

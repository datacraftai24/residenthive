import { SignUp } from "@clerk/clerk-react";
import AuthLayout from "@/components/AuthLayout";

export default function SignUpPage() {
  return (
    <AuthLayout title="Join ResidentHive" subtitle="Create your account to get started">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        afterSignUpUrl="/dashboard"
        redirectUrl="/dashboard"
      />
    </AuthLayout>
  );
}

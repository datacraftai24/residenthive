import { useEffect } from "react";
import { useUser, useAuth } from "@clerk/clerk-react";
import { identifyUser, resetPostHog } from "@/lib/posthog";

export function usePostHogIdentify() {
  const { user, isLoaded } = useUser();
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && user) {
      identifyUser(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
      });
    } else {
      resetPostHog();
    }
  }, [isLoaded, isSignedIn, user]);
}

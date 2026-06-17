import App from "./App";
import { ClerkProvider } from "@clerk/clerk-react";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

if (!clerkPubKey) {
  // eslint-disable-next-line no-console
  console.warn("VITE_CLERK_PUBLISHABLE_KEY is not set. Clerk auth will be disabled.");
}

// Wraps the full app (and all its heavy page/chart/Clerk dependencies) so it can
// be code-split out of the entry bundle. The public marketing pages never import
// this, keeping their payload tiny.
export default function AppRoot() {
  if (!clerkPubKey) {
    return <App />;
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      <App />
    </ClerkProvider>
  );
}

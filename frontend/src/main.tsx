import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ClerkProvider } from "@clerk/clerk-react";
import Landing from "./pages/landing";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

if (!clerkPubKey) {
  // eslint-disable-next-line no-console
  console.warn("VITE_CLERK_PUBLISHABLE_KEY is not set. Clerk auth will be disabled.");
}

// Check if we're on the landing page - render it directly without Clerk
const isLandingPage = window.location.pathname === "/";

createRoot(document.getElementById("root")!).render(
  isLandingPage ? (
    // Render landing page directly without Clerk wrapper to avoid redirect
    <Landing />
  ) : clerkPubKey ? (
    <ClerkProvider
      publishableKey={clerkPubKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      <App />
    </ClerkProvider>
  ) : (
    <App />
  )
);

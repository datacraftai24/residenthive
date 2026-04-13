import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ClerkProvider } from "@clerk/clerk-react";
import { HelmetProvider } from "react-helmet-async";
import Landing from "./pages/landing";
import MassachusettsPage from "./pages/massachusetts";
import OntarioPage from "./pages/ontario";
import OfferBotPage from "./pages/offer-bot";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

if (!clerkPubKey) {
  // eslint-disable-next-line no-console
  console.warn("VITE_CLERK_PUBLISHABLE_KEY is not set. Clerk auth will be disabled.");
}

// Public marketing pages — render without Clerk wrapper
const publicPageMap: Record<string, React.ComponentType> = {
  "/": Landing,
  "/massachusetts": MassachusettsPage,
  "/ontario": OntarioPage,
  "/offer-bot": OfferBotPage,
};

const PublicPage = publicPageMap[window.location.pathname];

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    {PublicPage ? (
      <PublicPage />
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
    )}
  </HelmetProvider>
);

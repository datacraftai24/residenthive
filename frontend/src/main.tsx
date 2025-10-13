import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ClerkProvider } from "@clerk/clerk-react";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

if (!clerkPubKey) {
  // eslint-disable-next-line no-console
  console.warn("VITE_CLERK_PUBLISHABLE_KEY is not set. Clerk auth will be disabled.");
}

createRoot(document.getElementById("root")!).render(
  clerkPubKey ? (
    <ClerkProvider publishableKey={clerkPubKey}>
      <App />
    </ClerkProvider>
  ) : (
    <App />
  )
);

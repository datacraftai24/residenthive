import { createRoot } from "react-dom/client";
import "./index.css";
import { HelmetProvider } from "react-helmet-async";
import Landing from "./pages/landing";
import MassachusettsPage from "./pages/massachusetts";
import OntarioPage from "./pages/ontario";
import OfferBotPage from "./pages/offer-bot";

// Public marketing pages — the first paint for visitors. Rendered directly from
// the small entry bundle, without Clerk. Everything else (dashboard, analytics,
// charts, Clerk auth) lives in App and is loaded on demand so these public
// routes never pay for it.
const publicPageMap: Record<string, React.ComponentType> = {
  "/": Landing,
  "/massachusetts": MassachusettsPage,
  "/ontario": OntarioPage,
  "/offer-bot": OfferBotPage,
};

const root = createRoot(document.getElementById("root")!);
const PublicPage = publicPageMap[window.location.pathname];

if (PublicPage) {
  root.render(
    <HelmetProvider>
      <PublicPage />
    </HelmetProvider>
  );
} else {
  import("./AppRoot").then(({ default: AppRoot }) => {
    root.render(
      <HelmetProvider>
        <AppRoot />
      </HelmetProvider>
    );
  });
}

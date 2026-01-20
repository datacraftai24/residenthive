import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@clerk/clerk-react";
import { Building2, Loader2 } from "lucide-react";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import ClientDashboard from "@/pages/client-dashboard";
import { BuyerReportPage } from "@/pages/BuyerReportPage";
import { SharedPropertyDetail } from "@/pages/shared-property-detail";
import Analytics from "@/pages/analytics";
import AgentLogin from "@/pages/agent-login";
import AgentSetup from "@/pages/agent-setup";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import ProtectedRoute from "@/components/ProtectedRoute";


// Component to handle the root path based on auth state
function RootRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();

  // Show loading while Clerk loads
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-white p-4 rounded-full shadow-lg">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-4 text-blue-600" />
        </div>
      </div>
    );
  }

  // If signed in, redirect to dashboard
  if (isSignedIn) {
    setLocation("/dashboard");
    return null;
  }

  // Show landing page for unauthenticated users
  return <Landing />;
}

function Router() {
  return (
    <Switch>
      {/* Public routes - no authentication required */}
      {/* Clerk Auth routes - handle both exact path and multi-step flows */}
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-in/:rest*" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/sign-up/:rest*" component={SignUpPage} />
      {/* Legacy login route points to Clerk sign-in for compatibility */}
      <Route path="/agent-login" component={AgentLogin} />
      <Route path="/agent-login/:rest*" component={AgentLogin} />
      <Route path="/agent-setup" component={AgentSetup} />
      <Route path="/client/:shareId" component={ClientDashboard} />
      <Route path="/buyer-report/:shareId" component={BuyerReportPage} />
      <Route path="/shared/reports/:shareId/property/:listingId" component={SharedPropertyDetail} />

      {/* Protected routes - authentication required */}
      <Route path="/analytics">
        <ProtectedRoute>
          <Analytics />
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>

      {/* Root path - shows landing for unauthenticated, redirects to dashboard for authenticated */}
      <Route path="/" component={RootRoute} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

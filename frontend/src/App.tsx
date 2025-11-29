import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import ClientDashboard from "@/pages/client-dashboard";
import { BuyerReportPage } from "@/pages/BuyerReportPage";
import Analytics from "@/pages/analytics";
import AgentLogin from "@/pages/agent-login";
import AgentSetup from "@/pages/agent-setup";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import ProtectedRoute from "@/components/ProtectedRoute";


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

      {/* Protected routes - authentication required */}
      <Route path="/analytics">
        <ProtectedRoute>
          <Analytics />
        </ProtectedRoute>
      </Route>
      

      
      <Route path="/">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      
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

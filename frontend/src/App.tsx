import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import ClientDashboard from "@/pages/client-dashboard";
import Analytics from "@/pages/analytics";
import AgentLogin from "@/pages/agent-login";
import AgentSetup from "@/pages/agent-setup";
import ProtectedRoute from "@/components/ProtectedRoute";


function Router() {
  return (
    <Switch>
      {/* Public routes - no authentication required */}
      <Route path="/agent-login" component={AgentLogin} />
      <Route path="/agent-setup" component={AgentSetup} />
      <Route path="/client/:shareId" component={ClientDashboard} />
      
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

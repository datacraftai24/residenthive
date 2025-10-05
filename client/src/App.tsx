import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SignIn, SignUp } from "@clerk/clerk-react";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import ClientDashboard from "@/pages/client-dashboard";
import Analytics from "@/pages/analytics";
import ProtectedRoute from "@/components/ProtectedRoute";


function Router() {
  return (
    <Switch>
        {/* Clerk auth routes */}
        <Route path="/sign-in/*">
          <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
            <SignIn routing="path" path="/sign-in" redirectUrl="/" />
          </div>
        </Route>
        <Route path="/sign-up/*">
          <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
            <SignUp routing="path" path="/sign-up" redirectUrl="/" />
          </div>
        </Route>

        {/* Public routes */}
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

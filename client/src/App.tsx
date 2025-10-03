
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SignIn, SignUp, UserButton, SignedIn } from '@clerk/clerk-react';
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import ClientDashboard from "@/pages/client-dashboard";
import Analytics from "@/pages/analytics";
import ProtectedRoute from "@/components/ProtectedRoute";
import LandingPage from "@/pages/landing";


function Router() {
  return (
    <>
      {/* Add UserButton to header for signed-in users */}
      <SignedIn>
        <div className="absolute top-4 right-4 z-50">
          <UserButton afterSignOutUrl="/" />
        </div>
      </SignedIn>

      <Switch>
        {/* Landing page route */}
        <Route path="/" component={LandingPage} />
        {/* Clerk auth routes */}
        <Route path="/sign-in">
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="w-full max-w-md p-4">
              <SignIn routing="path" path="/sign-in" redirectUrl="/dashboard" />
            </div>
          </div>
        </Route>
        <Route path="/sign-up/*">
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="w-full max-w-md p-4">
              <SignUp routing="path" path="/sign-up/*" redirectUrl="/dashboard" />
            </div>
          </div>
        </Route>

        {/* Public routes */}
        <Route path="/client/:shareId" component={ClientDashboard} />

        {/* Protected routes */}
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

  <Route component={NotFound} />
      </Switch>
    </>
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

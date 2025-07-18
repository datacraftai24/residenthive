import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, Building2 } from "lucide-react";

interface Agent {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  brokerageName: string;
  isActivated: boolean;
}

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const checkAuth = () => {
      const savedAgent = localStorage.getItem("agent");
      
      if (!savedAgent) {
        setLocation("/agent-login");
        return;
      }

      try {
        const parsedAgent = JSON.parse(savedAgent);
        
        // Validate agent data structure
        if (!parsedAgent.id || !parsedAgent.email || !parsedAgent.isActivated) {
          console.warn("Invalid agent data found, redirecting to login");
          localStorage.removeItem("agent");
          setLocation("/agent-login");
          return;
        }

        setAgent(parsedAgent);
      } catch (error) {
        console.error("Error parsing agent data:", error);
        localStorage.removeItem("agent");
        setLocation("/agent-login");
        return;
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [setLocation]);

  // Loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-white p-4 rounded-full shadow-lg">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // If no agent found, redirect happens in useEffect
  if (!agent) {
    return null;
  }

  // Pass agent data to children components
  return <>{children}</>;
}
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Building2, UserCheck, Lock, Eye, EyeOff } from "lucide-react";
import { useLocation } from "wouter";

interface Agent {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  brokerageName: string;
  isActivated: boolean;
}

export default function AgentSetup() {
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get('token');
  
  const [agent, setAgent] = useState<Agent | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAgent, setIsLoadingAgent] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Fetch agent info when component mounts
  useEffect(() => {
    if (!token) {
      setError("Invalid setup link. No token provided.");
      setIsLoadingAgent(false);
      return;
    }

    fetchAgentInfo();
  }, [token]);

  const fetchAgentInfo = async () => {
    try {
      const response = await fetch(`/api/agents/setup/${token}`);
      const data = await response.json();

      if (data.success && data.agent) {
        console.log("Agent data from API:", data.agent);
        setAgent(data.agent);
      } else {
        console.error("API Error:", data.error);
        setError(data.error || "Invalid or expired setup link");
      }
    } catch (error) {
      console.error("Error fetching agent info:", error);
      setError("Failed to load setup information");
    } finally {
      setIsLoadingAgent(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/agents/setup-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        // Redirect to login page after successful setup
        setTimeout(() => {
          setLocation("/agent-login");
        }, 2000);
      } else {
        setError(data.error || "Failed to set up account");
      }
    } catch (error) {
      console.error("Setup error:", error);
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingAgent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading setup information...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0">
          <CardContent className="p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="bg-green-100 p-4 rounded-full">
                <UserCheck className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Account Setup Complete!</h2>
            <p className="text-gray-600 mb-4">
              Your password has been set successfully. You will be redirected to the login page.
            </p>
            <Button 
              onClick={() => setLocation("/agent-login")}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-white p-4 rounded-full shadow-lg">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to ResidentHive</h1>
          <p className="text-gray-600">Complete your account setup</p>
        </div>

        {/* Show real agent info */}
        {agent ? (
          <Card className="mb-6 shadow-lg border-0">
            <CardContent className="p-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900">
                  {agent.firstName || 'Admin'} {agent.lastName || 'User'}
                </h3>
                <p className="text-gray-600">{agent.email || 'info@datacraftai.com'}</p>
                <p className="text-sm text-gray-500">{agent.brokerageName || 'DataCraft AI'}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6 shadow-lg border-0">
            <CardContent className="p-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900">
                  Loading agent information...
                </h3>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Set Your Password</CardTitle>
            <CardDescription className="text-center">
              Choose a secure password for your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    disabled={isLoading}
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500">Minimum 8 characters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 bg-blue-600 hover:bg-blue-700"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up account...
                  </>
                ) : (
                  "Complete Setup"
                )}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="text-sm font-medium text-blue-900 mb-2">Security Tips</h4>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• Use a unique password you don't use elsewhere</li>
                <li>• Include uppercase, lowercase, numbers, and symbols</li>
                <li>• Keep your login credentials secure</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-8 text-sm text-gray-500">
          <p>ResidentHive Agent Portal © 2024</p>
        </div>
      </div>
    </div>
  );
} 
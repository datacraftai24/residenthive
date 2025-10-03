import { useLocation } from "wouter";
import { useUser } from "@clerk/clerk-react";

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { user, isLoaded } = useUser();

  // If user is loaded and logged in, redirect to dashboard
  if (isLoaded && user) {
    setLocation("/dashboard");
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
      <h1 className="text-4xl font-bold text-center mb-8">Welcome to ResidentHive</h1>
      <div className="flex gap-4">
        <button
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold"
          onClick={() => setLocation("/sign-in")}
        >
          Sign In
        </button>
        <button
          className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold"
          onClick={() => setLocation("/sign-up/*")}
        >
          Sign Up
        </button>
      </div>
    </div>
  );
}

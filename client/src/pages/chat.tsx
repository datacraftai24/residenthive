import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BuyerProfile } from "@shared/schema";
import Sidebar from "@/components/sidebar";
import { ChatInterface } from "@/components/chat-interface";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, Users } from "lucide-react";

export default function ChatPage() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("default");
  const [selectedProperties, setSelectedProperties] = useState<any[]>([]);

  const { data: profiles = [], isLoading } = useQuery<BuyerProfile[]>({
    queryKey: ["/api/buyer-profiles"],
  });

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    // Reset properties when customer changes
    setSelectedProperties([]);
  };

  const handleProfileSelected = (profile: BuyerProfile) => {
    setSelectedCustomerId(`customer_${profile.id}`);
    // Convert profile to properties format for chat context
    const properties = [{
      address: `${profile.preferredAreas?.[0] || 'Unknown Location'}`,
      price: `$${profile.budgetMin || 0} - $${profile.budgetMax || 0}`,
      bedrooms: profile.bedrooms,
      bathrooms: profile.bathrooms,
      property_type: profile.homeType,
      city: profile.preferredAreas?.[0] || 'Unknown',
      state: 'CA',
      description: `Looking for ${profile.bedrooms} bedroom, ${profile.bathrooms} bathroom ${profile.homeType} in ${profile.preferredAreas?.join(', ') || 'preferred areas'}`
    }];
    setSelectedProperties(properties);
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-slate-50">
      <div className="lg:hidden">
        <Sidebar 
          profiles={profiles}
          isLoading={isLoading}
          selectedProfile={profiles.find(p => `customer_${p.id}` === selectedCustomerId) || null}
          onSelectProfile={handleProfileSelected}
          isMobile={true}
        />
      </div>
      
      <div className="hidden lg:block">
        <Sidebar 
          profiles={profiles}
          isLoading={isLoading}
          selectedProfile={profiles.find(p => `customer_${p.id}` === selectedCustomerId) || null}
          onSelectProfile={handleProfileSelected}
          isMobile={false}
        />
      </div>
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg sm:text-xl font-semibold text-slate-900">AI Chat Assistant</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">Get personalized real estate assistance</p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-slate-400" />
                <Select value={selectedCustomerId} onValueChange={handleCustomerChange}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default Customer</SelectItem>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={`customer_${profile.id}`}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden p-4 sm:p-6">
          <div className="h-full max-w-4xl mx-auto">
            <ChatInterface
              customerId={selectedCustomerId}
              customerProperties={selectedProperties}
              agentName="ResidentHive Agent"
              className="h-full"
            />
          </div>
        </div>
      </main>
    </div>
  );
} 
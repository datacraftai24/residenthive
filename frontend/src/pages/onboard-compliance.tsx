import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useUser, useClerk } from "@clerk/clerk-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Shield, Scale, FileCheck, Brain, Building2, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ComplianceItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

function getComplianceItems(jurisdiction: string): ComplianceItem[] {
  const fairHousingDesc =
    jurisdiction === "ON"
      ? "I acknowledge the Ontario Human Rights Code protects individuals from discrimination based on 17 grounds: race, ancestry, place of origin, colour, ethnic origin, citizenship, creed, sex, sexual orientation, gender identity/expression, age, marital status, family status, disability, receipt of public assistance, record of offences, and association. I will comply with all applicable human rights laws in my real estate practice."
      : "I acknowledge the Massachusetts Fair Housing Act protects individuals from discrimination based on 14+ classes: the 7 federal protected classes (race, color, national origin, religion, sex, familial status, disability) plus sexual orientation, gender identity, age, marital status, veteran status, genetic information, ancestry, and source of income. I will comply with all applicable fair housing laws in my real estate practice.";

  return [
    {
      id: "fair_housing",
      icon: <Shield className="h-5 w-5 text-blue-600" />,
      title: "Fair Housing Compliance",
      description: fairHousingDesc,
    },
    {
      id: "agency_disclosure",
      icon: <Scale className="h-5 w-5 text-blue-600" />,
      title: "Agency Disclosure",
      description:
        "I acknowledge that buyer briefs generated through ResidentHive are sent under my brokerage's name and license. I am responsible for providing the Massachusetts mandatory agency disclosure form (254 CMR 3.00(13)(a)) to buyers at the appropriate time in accordance with state regulations.",
    },
    {
      id: "buyer_representation",
      icon: <FileCheck className="h-5 w-5 text-blue-600" />,
      title: "Buyer Representation Agreement",
      description:
        'I acknowledge that per the NAR settlement (effective August 2024), a written buyer representation agreement is required before touring a home. Any "Request Showing" action through ResidentHive does not replace this obligation. I am responsible for ensuring compliance with buyer representation requirements.',
    },
    {
      id: "ai_disclosure",
      icon: <Brain className="h-5 w-5 text-blue-600" />,
      title: "AI Disclosure",
      description:
        "I acknowledge that ResidentHive uses artificial intelligence to generate buyer briefs, property analysis, and compliance flags. Flagged topics require my professional judgment — the platform does not provide legal or real estate advice. I understand that AI-generated content should be reviewed before sharing with clients.",
    },
  ];
}

export default function OnboardCompliancePage() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // Get jurisdiction from onboarding status
  const { data: status } = useQuery<{
    brokerage: { jurisdiction: string } | null;
  }>({
    queryKey: ["/api/onboarding/status"],
    staleTime: 30_000,
  });

  const jurisdiction = status?.brokerage?.jurisdiction || "MA";
  const items = getComplianceItems(jurisdiction);
  const allChecked = items.every((item) => checkedItems[item.id]);

  const acknowledgeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboarding/compliance");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      toast({
        title: "Compliance acknowledged",
        description: "You now have full access to the dashboard.",
      });
      // Force hard navigation to avoid race condition with query invalidation
      window.location.href = "/dashboard";
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">Compliance Acknowledgment</CardTitle>
          <CardDescription className="text-base mt-2">
            Before accessing the dashboard, please review and acknowledge the
            following compliance requirements. All items are required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {items.map((item, index) => (
            <div key={item.id}>
              {index > 0 && <Separator className="mb-6" />}
              <div className="flex gap-4">
                <div className="flex-shrink-0 mt-1">
                  <Checkbox
                    id={item.id}
                    checked={!!checkedItems[item.id]}
                    onCheckedChange={(checked) =>
                      setCheckedItems((prev) => ({
                        ...prev,
                        [item.id]: !!checked,
                      }))
                    }
                  />
                </div>
                <label htmlFor={item.id} className="cursor-pointer space-y-1">
                  <div className="flex items-center gap-2">
                    {item.icon}
                    <span className="font-semibold text-gray-900">
                      {item.title}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {item.description}
                  </p>
                </label>
              </div>
            </div>
          ))}

          <Separator />

          <Button
            onClick={() => acknowledgeMutation.mutate()}
            disabled={!allChecked || acknowledgeMutation.isPending}
            className="w-full"
            size="lg"
          >
            {acknowledgeMutation.isPending
              ? "Acknowledging..."
              : "I Acknowledge All Compliance Requirements"}
          </Button>

          <p className="text-xs text-center text-gray-500">
            Your acknowledgment will be timestamped and stored. Contact your
            broker of record if you have questions about any of these
            requirements.
          </p>

          <div className="text-center">
            <button
              onClick={() => signOut(() => setLocation("/"))}
              className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  buyerFormSchema, 
  type BuyerFormData, 
  type BuyerProfile,
  HOME_TYPES,
  MUST_HAVE_FEATURES,
  LIFESTYLE_DRIVERS,
  SPECIAL_NEEDS
} from "@shared/schema";
import { ArrowLeft, Save, X } from "lucide-react";

interface ProfileEditProps {
  profile: BuyerProfile;
  onClose: () => void;
  onProfileUpdated: (profile: BuyerProfile) => void;
}

export default function ProfileEdit({ profile, onClose, onProfileUpdated }: ProfileEditProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<BuyerFormData>({
    resolver: zodResolver(buyerFormSchema),
    defaultValues: {
      name: profile.name,
      email: profile.email,
      budget: parseFloat(profile.budget.replace(/[^0-9.]/g, "")),
      homeType: profile.homeType,
      bedrooms: profile.bedrooms,
      bathrooms: profile.bathrooms,
      mustHaveFeatures: profile.mustHaveFeatures,
      preferredAreas: profile.preferredAreas,
      lifestyleDrivers: profile.lifestyleDrivers,
      specialNeeds: profile.specialNeeds,
      dealbreakers: profile.dealbreakers,
      budgetFlexibility: profile.budgetFlexibility,
      locationFlexibility: profile.locationFlexibility,
      timingFlexibility: profile.timingFlexibility,
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<BuyerFormData>) => {
      const updateData = {
        ...data,
        budget: data.budget ? `$${data.budget.toLocaleString()}.00` : undefined,
      };
      
      return apiRequest(`/api/buyer-profiles/${profile.id}`, {
        method: "PATCH",
        body: JSON.stringify(updateData),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (updatedProfile: BuyerProfile) => {
      queryClient.invalidateQueries({ queryKey: ['/api/buyer-profiles'] });
      onProfileUpdated(updatedProfile);
      toast({
        title: "Profile Updated",
        description: "The buyer profile has been successfully updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: "Failed to update the profile. Please try again.",
        variant: "destructive",
      });
      console.error("Profile update error:", error);
    }
  });

  const onSubmit = (data: BuyerFormData) => {
    updateMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold">Edit Profile</h2>
            <p className="text-sm text-gray-600">Make changes to buyer preferences and details</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            Version {profile.version}
          </Badge>
          <Badge variant={profile.inputMethod === 'form' ? 'default' : 'secondary'}>
            {profile.inputMethod}
          </Badge>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  {...form.register("name")}
                  placeholder="Enter full name"
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...form.register("email")}
                  placeholder="Enter email address"
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget">Budget ($)</Label>
                <Input
                  id="budget"
                  type="number"
                  {...form.register("budget", { valueAsNumber: true })}
                  placeholder="500000"
                />
                {form.formState.errors.budget && (
                  <p className="text-sm text-red-600">{form.formState.errors.budget.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="bedrooms">Bedrooms</Label>
                <Input
                  id="bedrooms"
                  type="number"
                  {...form.register("bedrooms", { valueAsNumber: true })}
                  placeholder="3"
                />
                {form.formState.errors.bedrooms && (
                  <p className="text-sm text-red-600">{form.formState.errors.bedrooms.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="bathrooms">Bathrooms</Label>
                <Input
                  id="bathrooms"
                  {...form.register("bathrooms")}
                  placeholder="2.5"
                />
                {form.formState.errors.bathrooms && (
                  <p className="text-sm text-red-600">{form.formState.errors.bathrooms.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="homeType">Home Type</Label>
              <Select 
                value={form.watch("homeType")} 
                onValueChange={(value) => form.setValue("homeType", value as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select home type" />
                </SelectTrigger>
                <SelectContent>
                  {HOME_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.homeType && (
                <p className="text-sm text-red-600">{form.formState.errors.homeType.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Must-Have Features</Label>
              <div className="grid grid-cols-2 gap-2">
                {MUST_HAVE_FEATURES.map((feature) => (
                  <div key={feature.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={feature.value}
                      checked={form.watch("mustHaveFeatures")?.includes(feature.value)}
                      onCheckedChange={(checked) => {
                        const current = form.watch("mustHaveFeatures") || [];
                        if (checked) {
                          form.setValue("mustHaveFeatures", [...current, feature.value]);
                        } else {
                          form.setValue("mustHaveFeatures", current.filter(f => f !== feature.value));
                        }
                      }}
                    />
                    <Label htmlFor={feature.value} className="text-sm font-normal">
                      {feature.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Lifestyle Drivers</Label>
              <div className="grid grid-cols-2 gap-2">
                {LIFESTYLE_DRIVERS.map((driver) => (
                  <div key={driver.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={driver.value}
                      checked={form.watch("lifestyleDrivers")?.includes(driver.value)}
                      onCheckedChange={(checked) => {
                        const current = form.watch("lifestyleDrivers") || [];
                        if (checked) {
                          form.setValue("lifestyleDrivers", [...current, driver.value]);
                        } else {
                          form.setValue("lifestyleDrivers", current.filter(d => d !== driver.value));
                        }
                      }}
                    />
                    <Label htmlFor={driver.value} className="text-sm font-normal">
                      {driver.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Special Needs</Label>
              <div className="grid grid-cols-2 gap-2">
                {SPECIAL_NEEDS.map((need) => (
                  <div key={need.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={need.value}
                      checked={form.watch("specialNeeds")?.includes(need.value)}
                      onCheckedChange={(checked) => {
                        const current = form.watch("specialNeeds") || [];
                        if (checked) {
                          form.setValue("specialNeeds", [...current, need.value]);
                        } else {
                          form.setValue("specialNeeds", current.filter(n => n !== need.value));
                        }
                      }}
                    />
                    <Label htmlFor={need.value} className="text-sm font-normal">
                      {need.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={updateMutation.isPending}
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={updateMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
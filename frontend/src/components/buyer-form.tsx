import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  User, Home, DollarSign, Bed, Bath, Star, XCircle,
  MapPin, Heart, Users, Settings, Mic, Sparkles, ChevronDown,
  TrendingUp, ArrowLeft, Save
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import VoiceInput from "./voice-input";
import {
  buyerFormSchema,
  type BuyerFormData,
  type ExtractedProfile,
  type InsertBuyerProfile,
  type BuyerProfile,
  HOME_TYPES,
  MUST_HAVE_FEATURES,
  LIFESTYLE_DRIVERS,
  SPECIAL_NEEDS
} from "@shared/schema";

interface BuyerFormProps {
  onProfileExtracted?: (profile: ExtractedProfile) => void;
  profile?: BuyerProfile;
  mode?: 'create' | 'edit';
  onProfileUpdated?: (profile: BuyerProfile) => void;
  onClose?: () => void;
}

// Investor type options
const INVESTOR_TYPES = [
  { value: "rental_income", label: "Rental Income" },
  { value: "flip", label: "Fix & Flip" },
  { value: "house_hack", label: "House Hack" },
  { value: "multi_unit", label: "Multi-Unit Investment" }
] as const;

// Buyer type options
const BUYER_TYPES = [
  { value: "traditional", label: "Traditional Buyer" },
  { value: "investor", label: "Investor" },
  { value: "first_time", label: "First-Time Buyer" },
  { value: "luxury", label: "Luxury Buyer" }
] as const;

// Helper to map BuyerProfile to BuyerFormData
function mapProfileToFormData(profile: BuyerProfile): Partial<BuyerFormData> {
  return {
    name: profile.name,
    email: profile.email || '',
    phone: profile.phone || '',
    location: profile.location,
    buyerType: (profile.buyerType as BuyerFormData['buyerType']) || 'traditional',
    budget: profile.budget,
    budgetMin: profile.budgetMin ?? undefined,
    budgetMax: profile.budgetMax ?? undefined,
    homeType: (profile.homeType as BuyerFormData['homeType']) || 'single-family',
    bedrooms: profile.bedrooms || 3,
    // Note: minBedrooms, maxBedrooms, minBathrooms not in drizzle schema yet
    minBedrooms: undefined,
    maxBedrooms: undefined,
    bathrooms: profile.bathrooms || '2',
    minBathrooms: undefined,
    mustHaveFeatures: profile.mustHaveFeatures || [],
    dealbreakers: profile.dealbreakers || [],
    preferredAreas: profile.preferredAreas || [],
    lifestyleDrivers: profile.lifestyleDrivers || [],
    specialNeeds: profile.specialNeeds || [],
    budgetFlexibility: profile.budgetFlexibility || 50,
    locationFlexibility: profile.locationFlexibility || 50,
    timingFlexibility: profile.timingFlexibility || 50,
    emotionalContext: profile.emotionalContext || '',
    voiceTranscript: '',
    investorType: (profile.investorType as BuyerFormData['investorType']) || undefined,
    investmentCapital: profile.investmentCapital ?? undefined,
    targetMonthlyReturn: profile.targetMonthlyReturn ?? undefined,
    targetCapRate: profile.targetCapRate ? Number(profile.targetCapRate) : undefined,
    investmentStrategy: profile.investmentStrategy || undefined,
    // Commute
    workAddress: profile.workAddress || undefined,
    maxCommuteMins: profile.maxCommuteMins ?? undefined
  };
}

export default function BuyerForm({
  onProfileExtracted,
  profile,
  mode = 'create',
  onProfileUpdated,
  onClose
}: BuyerFormProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [investorSectionOpen, setInvestorSectionOpen] = useState(false);
  const [commuteSectionOpen, setCommuteSectionOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<BuyerFormData>({
    resolver: zodResolver(buyerFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      location: "",
      buyerType: "traditional",
      budget: "",
      budgetMin: undefined,
      budgetMax: undefined,
      homeType: "single-family",
      bedrooms: 2,
      minBedrooms: undefined,
      maxBedrooms: undefined,
      bathrooms: "2",
      minBathrooms: undefined,
      mustHaveFeatures: [],
      dealbreakers: [],
      preferredAreas: [],
      lifestyleDrivers: [],
      specialNeeds: [],
      budgetFlexibility: 50,
      locationFlexibility: 50,
      timingFlexibility: 50,
      emotionalContext: "",
      voiceTranscript: "",
      investorType: undefined,
      investmentCapital: undefined,
      targetMonthlyReturn: undefined,
      targetCapRate: undefined,
      investmentStrategy: undefined,
      // Commute
      workAddress: undefined,
      maxCommuteMins: undefined
    }
  });

  // CRITICAL: Reset form when profile data loads in edit mode
  useEffect(() => {
    if (profile && mode === 'edit') {
      const formData = mapProfileToFormData(profile);
      form.reset(formData as BuyerFormData);
      // Open investor section if this is an investor profile
      if (profile.buyerType === 'investor') {
        setInvestorSectionOpen(true);
      }
    }
  }, [profile, mode, form]);

  // Save profile to database after enhancement
  const saveProfileMutation = useMutation({
    mutationFn: async (data: { enhancedProfile: ExtractedProfile; originalFormData: BuyerFormData }) => {
      const { enhancedProfile, originalFormData } = data;
      
      // Transform ExtractedProfile to InsertBuyerProfile format
      const savePayload: InsertBuyerProfile = {
        name: enhancedProfile.name,
        email: enhancedProfile.email || "",
        location: enhancedProfile.location,
        budget: enhancedProfile.budget,
        budgetMin: enhancedProfile.budgetMin,
        budgetMax: enhancedProfile.budgetMax,
        homeType: enhancedProfile.homeType,
        bedrooms: enhancedProfile.bedrooms,
        bathrooms: enhancedProfile.bathrooms,
        mustHaveFeatures: enhancedProfile.mustHaveFeatures || [],
        dealbreakers: enhancedProfile.dealbreakers || [],
        preferredAreas: enhancedProfile.preferredAreas || [],
        lifestyleDrivers: enhancedProfile.lifestyleDrivers || [],
        specialNeeds: enhancedProfile.specialNeeds || [],
        budgetFlexibility: originalFormData.budgetFlexibility,
        locationFlexibility: originalFormData.locationFlexibility,
        timingFlexibility: originalFormData.timingFlexibility,
        emotionalContext: enhancedProfile.emotionalContext,
        voiceTranscript: originalFormData.voiceTranscript,
        inferredTags: enhancedProfile.inferredTags || [],
        emotionalTone: enhancedProfile.emotionalTone,
        priorityScore: enhancedProfile.priorityScore || 50,
        rawInput: originalFormData.voiceTranscript || JSON.stringify(originalFormData),
        inputMethod: originalFormData.voiceTranscript ? "voice" : "form",
        nlpConfidence: 100, // Form input has high confidence
        version: 1
      };
      
      const response = await apiRequest("POST", "/api/buyer-profiles", savePayload);
      return response.json();
    },
    onSuccess: (savedProfile) => {
      queryClient.invalidateQueries({ queryKey: ['/api/buyer-profiles'] });
      toast({
        title: "Profile Saved Successfully",
        description: "Buyer profile has been saved to your database.",
      });
    },
    onError: (error) => {
      console.error("Save profile error:", error);
      toast({
        title: "Save Failed",
        description: "Failed to save buyer profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const enhanceMutation = useMutation({
    mutationFn: async (formData: BuyerFormData) => {
      const response = await apiRequest("POST", "/api/enhance-profile", { formData });
      return response.json();
    },
    onSuccess: (enhancedProfile: ExtractedProfile, originalFormData: BuyerFormData) => {
      // First, call the onProfileExtracted callback if provided
      if (onProfileExtracted) {
        onProfileExtracted(enhancedProfile);
      }

      // Then save the profile to database
      saveProfileMutation.mutate({ enhancedProfile, originalFormData });

      toast({
        title: "Profile Enhanced",
        description: "Buyer profile has been analyzed with AI insights and is being saved...",
      });
    },
    onError: (error) => {
      toast({
        title: "Enhancement Failed",
        description: error.message || "Failed to enhance buyer profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update mutation for edit mode (PATCH)
  const updateMutation = useMutation({
    mutationFn: async (data: BuyerFormData) => {
      if (!profile?.id) throw new Error("No profile ID for update");

      // Build update payload with all form fields
      const updatePayload = {
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        location: data.location,
        buyerType: data.buyerType,
        budget: data.budget,
        budgetMin: data.budgetMin || null,
        budgetMax: data.budgetMax || null,
        homeType: data.homeType,
        bedrooms: data.bedrooms,
        minBedrooms: data.minBedrooms || null,
        maxBedrooms: data.maxBedrooms || null,
        bathrooms: data.bathrooms,
        minBathrooms: data.minBathrooms || null,
        mustHaveFeatures: data.mustHaveFeatures,
        dealbreakers: data.dealbreakers,
        preferredAreas: data.preferredAreas,
        lifestyleDrivers: data.lifestyleDrivers,
        specialNeeds: data.specialNeeds,
        budgetFlexibility: data.budgetFlexibility,
        locationFlexibility: data.locationFlexibility,
        timingFlexibility: data.timingFlexibility,
        emotionalContext: data.emotionalContext || null,
        // Investor fields
        investorType: data.investorType || null,
        investmentCapital: data.investmentCapital || null,
        targetMonthlyReturn: data.targetMonthlyReturn || null,
        targetCapRate: data.targetCapRate || null,
        investmentStrategy: data.investmentStrategy || null,
        // Commute fields
        workAddress: data.workAddress || null,
        maxCommuteMins: data.maxCommuteMins || null
      };

      const response = await apiRequest("PATCH", `/api/buyer-profiles/${profile.id}`, updatePayload);
      return response.json();
    },
    onSuccess: async (updatedProfile: BuyerProfile) => {
      // Regenerate AI insights after profile update
      try {
        const regenerateResponse = await apiRequest("POST", `/api/buyer-profiles/${profile?.id}/regenerate-insights`);
        if (regenerateResponse.ok) {
          const profileWithInsights = await regenerateResponse.json();
          console.log("[BuyerForm] AI insights regenerated successfully");

          queryClient.invalidateQueries({ queryKey: ['/api/buyer-profiles'] });
          queryClient.invalidateQueries({ queryKey: [`/api/buyer-profiles/${profile?.id}`] });

          toast({
            title: "Profile Updated",
            description: "Buyer profile and AI analysis have been updated.",
          });

          if (onProfileUpdated) {
            onProfileUpdated(profileWithInsights);
          }
        } else {
          console.warn("[BuyerForm] Failed to regenerate AI insights, using updated profile");
          queryClient.invalidateQueries({ queryKey: ['/api/buyer-profiles'] });
          queryClient.invalidateQueries({ queryKey: [`/api/buyer-profiles/${profile?.id}`] });

          toast({
            title: "Profile Updated",
            description: "Profile updated but AI analysis refresh failed.",
            variant: "default",
          });

          if (onProfileUpdated) {
            onProfileUpdated(updatedProfile);
          }
        }
      } catch (error) {
        console.error("[BuyerForm] Error regenerating AI insights:", error);
        queryClient.invalidateQueries({ queryKey: ['/api/buyer-profiles'] });
        queryClient.invalidateQueries({ queryKey: [`/api/buyer-profiles/${profile?.id}`] });

        toast({
          title: "Profile Updated",
          description: "Profile updated but AI analysis refresh failed.",
          variant: "default",
        });

        if (onProfileUpdated) {
          onProfileUpdated(updatedProfile);
        }
      }

      if (onClose) {
        onClose();
      }
    },
    onError: (error) => {
      console.error("Update profile error:", error);
      toast({
        title: "Update Failed",
        description: "Failed to update buyer profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleVoiceTranscription = (transcription: string) => {
    const newTranscript = voiceTranscript + " " + transcription;
    setVoiceTranscript(newTranscript);
    form.setValue("voiceTranscript", newTranscript);
  };

  const handleFeatureToggle = (feature: string, field: string) => {
    const currentValues = form.getValues(field as keyof BuyerFormData) as string[];
    const newValues = currentValues.includes(feature)
      ? currentValues.filter(f => f !== feature)
      : [...currentValues, feature];
    form.setValue(field as keyof BuyerFormData, newValues);
  };

  const handleAreaAdd = (area: string) => {
    if (area.trim()) {
      const currentAreas = form.getValues("preferredAreas");
      if (!currentAreas.includes(area.trim())) {
        form.setValue("preferredAreas", [...currentAreas, area.trim()]);
      }
    }
  };

  const handleAreaRemove = (area: string) => {
    const currentAreas = form.getValues("preferredAreas");
    form.setValue("preferredAreas", currentAreas.filter(a => a !== area));
  };

  const onSubmit = (data: BuyerFormData) => {
    const formDataWithVoice = {
      ...data,
      voiceTranscript: voiceTranscript || data.voiceTranscript
    };

    // Use update mutation for edit mode, enhance mutation for create mode
    if (mode === 'edit' && profile) {
      updateMutation.mutate(formDataWithVoice);
    } else {
      enhanceMutation.mutate(formDataWithVoice);
    }
  };

  const isSubmitting = mode === 'edit' ? updateMutation.isPending : enhanceMutation.isPending;

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <User className="h-5 w-5 text-primary" />
            <span>{mode === 'edit' ? `Edit Profile: ${profile?.name}` : 'Comprehensive Buyer Profile'}</span>
          </CardTitle>
          {mode === 'edit' && onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            
            {/* Basic Information */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <User className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-semibold">Basic Information</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buyer Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John & Sarah Smith" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input placeholder="john.smith@email.com" type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="(555) 123-4567" type="tel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="buyerType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buyer Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select buyer type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BUYER_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Search Location(s)</FormLabel>
                      <FormControl>
                        <Input placeholder="Boston, Quincy or South Shore MA" {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter a city, multiple cities (Boston, Quincy, Brookline), or a region (South Shore, Greater Boston)
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="budget"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Budget</FormLabel>
                      <FormControl>
                        <Input placeholder="$450K - $520K" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Property Requirements */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <Home className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-semibold">Property Requirements</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="homeType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Home Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select home type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {HOME_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bedrooms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bedrooms</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select bedrooms" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6].map((num) => (
                            <SelectItem key={num} value={num.toString()}>
                              {num} {num === 1 ? 'bedroom' : 'bedrooms'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bathrooms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bathrooms</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select bathrooms" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {["1", "1.5", "2", "2.5", "3", "3.5", "4", "4+"].map((num) => (
                            <SelectItem key={num} value={num}>
                              {num} {num === "1" ? 'bathroom' : 'bathrooms'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Must-Have Features */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <Star className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-semibold">Must-Have Features</h3>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MUST_HAVE_FEATURES.map((feature) => (
                  <div key={feature} className="flex items-center space-x-2">
                    <Checkbox
                      id={feature}
                      checked={form.watch("mustHaveFeatures").includes(feature)}
                      onCheckedChange={() => handleFeatureToggle(feature, "mustHaveFeatures")}
                    />
                    <Label htmlFor={feature} className="text-sm">{feature}</Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Lifestyle Drivers */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <Heart className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-semibold">Lifestyle Priorities</h3>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {LIFESTYLE_DRIVERS.map((driver) => (
                  <div key={driver} className="flex items-center space-x-2">
                    <Checkbox
                      id={driver}
                      checked={form.watch("lifestyleDrivers").includes(driver)}
                      onCheckedChange={() => handleFeatureToggle(driver, "lifestyleDrivers")}
                    />
                    <Label htmlFor={driver} className="text-sm">{driver}</Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Special Needs */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <Users className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-semibold">Special Requirements</h3>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {SPECIAL_NEEDS.map((need) => (
                  <div key={need} className="flex items-center space-x-2">
                    <Checkbox
                      id={need}
                      checked={form.watch("specialNeeds").includes(need)}
                      onCheckedChange={() => handleFeatureToggle(need, "specialNeeds")}
                    />
                    <Label htmlFor={need} className="text-sm">{need}</Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Preferred Areas */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <MapPin className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-semibold">Preferred Areas</h3>
              </div>
              
              <div className="space-y-3">
                <div className="flex space-x-2">
                  <Input
                    placeholder="Add neighborhood or area..."
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAreaAdd(e.currentTarget.value);
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const input = document.querySelector('input[placeholder="Add neighborhood or area..."]') as HTMLInputElement;
                      if (input) {
                        handleAreaAdd(input.value);
                        input.value = '';
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {form.watch("preferredAreas").map((area) => (
                    <Badge key={area} variant="secondary" className="cursor-pointer" onClick={() => handleAreaRemove(area)}>
                      {area} ×
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            {/* Flexibility Scores */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <Settings className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-semibold">Flexibility</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="budgetFlexibility"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Budget Flexibility: {field.value}%</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          onValueChange={(value) => field.onChange(value[0])}
                          max={100}
                          step={10}
                          className="w-full"
                        />
                      </FormControl>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Rigid</span>
                        <span>Very Flexible</span>
                      </div>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="locationFlexibility"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location Flexibility: {field.value}%</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          onValueChange={(value) => field.onChange(value[0])}
                          max={100}
                          step={10}
                          className="w-full"
                        />
                      </FormControl>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Rigid</span>
                        <span>Very Flexible</span>
                      </div>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="timingFlexibility"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timing Flexibility: {field.value}%</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          onValueChange={(value) => field.onChange(value[0])}
                          max={100}
                          step={10}
                          className="w-full"
                        />
                      </FormControl>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Urgent</span>
                        <span>Very Patient</span>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Investor Section - Only show when buyerType is investor */}
            {form.watch("buyerType") === "investor" && (
              <Collapsible open={investorSectionOpen} onOpenChange={setInvestorSectionOpen}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer p-3 bg-slate-50 rounded-lg hover:bg-slate-100">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <h3 className="text-lg font-semibold">Investment Details</h3>
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${investorSectionOpen ? 'rotate-180' : ''}`} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="investorType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Investment Strategy</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select investment type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {INVESTOR_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="investmentCapital"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Available Capital ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="e.g., 100000"
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="targetMonthlyReturn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Monthly Cash Flow ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="e.g., 500"
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="targetCapRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Cap Rate (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="e.g., 6.5"
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="investmentStrategy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Investment Strategy Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe your investment strategy, goals, and any specific requirements..."
                            className="min-h-[80px]"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CollapsibleContent>
              </Collapsible>
            )}

            {form.watch("buyerType") === "investor" && <Separator />}

            {/* Commute Section - Always available */}
            <Collapsible open={commuteSectionOpen} onOpenChange={setCommuteSectionOpen}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer p-3 bg-slate-50 rounded-lg hover:bg-slate-100">
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <h3 className="text-lg font-semibold">Commute Requirements</h3>
                    <span className="text-sm text-muted-foreground">(Optional)</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 transition-transform ${commuteSectionOpen ? 'rotate-180' : ''}`} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  Add work address to enable commute analysis in property searches.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="workAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Work Address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., 123 Main St, Toronto, ON"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="maxCommuteMins"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Commute Time (minutes)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="e.g., 35"
                            min={5}
                            max={120}
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Emotional Context & Voice Input */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <Mic className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-semibold">Additional Context</h3>
              </div>
              
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="emotionalContext"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any additional context, concerns, or special circumstances..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-2 block">
                    Voice Input
                  </Label>
                  <VoiceInput
                    onTranscription={handleVoiceTranscription}
                    isRecording={isRecording}
                    setIsRecording={setIsRecording}
                  />
                  {voiceTranscript && (
                    <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-600">Voice transcript:</p>
                      <p className="text-sm mt-1">{voiceTranscript}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Submit Button */}
            <div className="flex justify-center gap-4 pt-4">
              {mode === 'edit' && onClose && (
                <Button type="button" variant="outline" size="lg" onClick={onClose}>
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={isSubmitting || isRecording}
                className="px-8 py-2 bg-primary hover:bg-primary/90"
                size="lg"
              >
                {mode === 'edit' ? (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {isSubmitting ? "Saving..." : "Save Changes"}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {isSubmitting ? "Creating Profile..." : "Create Enhanced Profile"}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

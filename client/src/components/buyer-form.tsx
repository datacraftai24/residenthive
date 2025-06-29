import { useState } from "react";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { 
  User, Home, DollarSign, Bed, Bath, Star, XCircle, 
  MapPin, Heart, Users, Settings, Mic, Sparkles 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import VoiceInput from "./voice-input";
import { 
  buyerFormSchema, 
  type BuyerFormData, 
  type ExtractedProfile,
  HOME_TYPES,
  MUST_HAVE_FEATURES,
  LIFESTYLE_DRIVERS,
  SPECIAL_NEEDS
} from "@shared/schema";

interface BuyerFormProps {
  onProfileExtracted: (profile: ExtractedProfile) => void;
}

export default function BuyerForm({ onProfileExtracted }: BuyerFormProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const { toast } = useToast();

  const form = useForm<BuyerFormData>({
    resolver: zodResolver(buyerFormSchema),
    defaultValues: {
      name: "",
      budget: "",
      homeType: "single-family",
      bedrooms: 2,
      bathrooms: "2",
      mustHaveFeatures: [],
      dealbreakers: [],
      preferredAreas: [],
      lifestyleDrivers: [],
      specialNeeds: [],
      budgetFlexibility: 50,
      locationFlexibility: 50,
      timingFlexibility: 50,
      emotionalContext: "",
      voiceTranscript: ""
    }
  });

  const enhanceMutation = useMutation({
    mutationFn: async (formData: BuyerFormData) => {
      const response = await apiRequest("POST", "/api/enhance-profile", { formData });
      return response.json();
    },
    onSuccess: (data: ExtractedProfile) => {
      onProfileExtracted(data);
      toast({
        title: "Profile Created Successfully",
        description: "Buyer profile has been analyzed and enhanced with AI insights.",
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
    enhanceMutation.mutate(formDataWithVoice);
  };

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <User className="h-5 w-5 text-primary" />
          <span>Comprehensive Buyer Profile</span>
        </CardTitle>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value.toString()}>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
            <div className="flex justify-center pt-4">
              <Button 
                type="submit"
                disabled={enhanceMutation.isPending || isRecording}
                className="px-8 py-2 bg-primary hover:bg-primary/90"
                size="lg"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {enhanceMutation.isPending ? "Creating Profile..." : "Create Enhanced Profile"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
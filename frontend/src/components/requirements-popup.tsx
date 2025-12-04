import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { type ExtractedProfile, HOME_TYPES } from "@shared/schema";

type MissingField = "location" | "budget" | "homeType" | "bedrooms" | "bathrooms";

interface RequirementsPopupProps {
  profile: ExtractedProfile;
  missingFields: MissingField[];
  onUpdate: (updated: ExtractedProfile) => void;
  onClose: () => void;
}

export default function RequirementsPopup({
  profile,
  missingFields,
  onUpdate,
  onClose,
}: RequirementsPopupProps) {
  const [formData, setFormData] = useState({
    location: profile.location || "",
    budgetMin: profile.budgetMin || 0,
    budgetMax: profile.budgetMax || 0,
    homeType: profile.homeType || "",
    bedrooms: profile.bedrooms ?? 0,
    bathrooms: profile.bathrooms || "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateAndSubmit = () => {
    const newErrors: Record<string, string> = {};

    if (missingFields.includes("location") && !formData.location.trim()) {
      newErrors.location = "Location is required";
    }
    if (missingFields.includes("budget") && !formData.budgetMin && !formData.budgetMax) {
      newErrors.budget = "Budget is required";
    }
    if (missingFields.includes("homeType") && !formData.homeType) {
      newErrors.homeType = "Home type is required";
    }
    if (missingFields.includes("bedrooms") && formData.bedrooms === 0) {
      newErrors.bedrooms = "Bedrooms is required";
    }
    if (missingFields.includes("bathrooms") && !formData.bathrooms.trim()) {
      newErrors.bathrooms = "Bathrooms is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Format budget string
    const budgetStr = formData.budgetMin && formData.budgetMax
      ? `$${(formData.budgetMin / 1000).toFixed(0)}K - $${(formData.budgetMax / 1000).toFixed(0)}K`
      : formData.budgetMin
        ? `$${(formData.budgetMin / 1000).toFixed(0)}K+`
        : formData.budgetMax
          ? `Up to $${(formData.budgetMax / 1000).toFixed(0)}K`
          : profile.budget;

    const updated: ExtractedProfile = {
      ...profile,
      location: formData.location || profile.location,
      budget: budgetStr,
      budgetMin: formData.budgetMin || profile.budgetMin,
      budgetMax: formData.budgetMax || profile.budgetMax,
      homeType: (formData.homeType || profile.homeType) as ExtractedProfile["homeType"],
      bedrooms: formData.bedrooms || profile.bedrooms,
      bathrooms: formData.bathrooms || profile.bathrooms,
    };

    onUpdate(updated);
  };

  const fieldLabels: Record<MissingField, string> = {
    location: "Location",
    budget: "Budget",
    homeType: "Home Type",
    bedrooms: "Bedrooms",
    bathrooms: "Bathrooms",
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-5 w-5" />
            Complete Required Fields
          </DialogTitle>
          <DialogDescription>
            The following fields are required to search for properties. Please fill them in to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {missingFields.includes("location") && (
            <div className="grid gap-2">
              <Label htmlFor="location">Location *</Label>
              <Input
                id="location"
                placeholder="e.g., Toronto, ON or Mississauga"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className={errors.location ? "border-red-500" : ""}
              />
              {errors.location && (
                <p className="text-xs text-red-500">{errors.location}</p>
              )}
            </div>
          )}

          {missingFields.includes("budget") && (
            <div className="grid gap-2">
              <Label>Budget Range *</Label>
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="Min (e.g., 400000)"
                    value={formData.budgetMin || ""}
                    onChange={(e) => setFormData({ ...formData, budgetMin: parseInt(e.target.value) || 0 })}
                    className={errors.budget ? "border-red-500" : ""}
                  />
                </div>
                <span className="text-gray-500">to</span>
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="Max (e.g., 600000)"
                    value={formData.budgetMax || ""}
                    onChange={(e) => setFormData({ ...formData, budgetMax: parseInt(e.target.value) || 0 })}
                    className={errors.budget ? "border-red-500" : ""}
                  />
                </div>
              </div>
              {errors.budget && (
                <p className="text-xs text-red-500">{errors.budget}</p>
              )}
            </div>
          )}

          {missingFields.includes("homeType") && (
            <div className="grid gap-2">
              <Label htmlFor="homeType">Home Type *</Label>
              <Select
                value={formData.homeType}
                onValueChange={(value) => setFormData({ ...formData, homeType: value })}
              >
                <SelectTrigger className={errors.homeType ? "border-red-500" : ""}>
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
              {errors.homeType && (
                <p className="text-xs text-red-500">{errors.homeType}</p>
              )}
            </div>
          )}

          {missingFields.includes("bedrooms") && (
            <div className="grid gap-2">
              <Label htmlFor="bedrooms">Bedrooms *</Label>
              <Input
                id="bedrooms"
                type="number"
                min={1}
                max={10}
                placeholder="e.g., 3"
                value={formData.bedrooms || ""}
                onChange={(e) => setFormData({ ...formData, bedrooms: parseInt(e.target.value) || 0 })}
                className={errors.bedrooms ? "border-red-500" : ""}
              />
              {errors.bedrooms && (
                <p className="text-xs text-red-500">{errors.bedrooms}</p>
              )}
            </div>
          )}

          {missingFields.includes("bathrooms") && (
            <div className="grid gap-2">
              <Label htmlFor="bathrooms">Bathrooms *</Label>
              <Input
                id="bathrooms"
                placeholder="e.g., 2 or 2.5"
                value={formData.bathrooms}
                onChange={(e) => setFormData({ ...formData, bathrooms: e.target.value })}
                className={errors.bathrooms ? "border-red-500" : ""}
              />
              {errors.bathrooms && (
                <p className="text-xs text-red-500">{errors.bathrooms}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Skip for Now
          </Button>
          <Button onClick={validateAndSubmit} className="bg-green-600 hover:bg-green-700">
            Update Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

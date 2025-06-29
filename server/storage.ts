import { buyerProfiles, type BuyerProfile, type InsertBuyerProfile } from "@shared/schema";

export interface IStorage {
  getBuyerProfile(id: number): Promise<BuyerProfile | undefined>;
  getAllBuyerProfiles(): Promise<BuyerProfile[]>;
  createBuyerProfile(profile: InsertBuyerProfile): Promise<BuyerProfile>;
  deleteBuyerProfile(id: number): Promise<void>;
}

export class MemStorage implements IStorage {
  private profiles: Map<number, BuyerProfile>;
  private currentId: number;

  constructor() {
    this.profiles = new Map();
    this.currentId = 1;
  }

  async getBuyerProfile(id: number): Promise<BuyerProfile | undefined> {
    return this.profiles.get(id);
  }

  async getAllBuyerProfiles(): Promise<BuyerProfile[]> {
    return Array.from(this.profiles.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createBuyerProfile(insertProfile: InsertBuyerProfile): Promise<BuyerProfile> {
    const id = this.currentId++;
    const profile: BuyerProfile = {
      id,
      name: insertProfile.name,
      budget: insertProfile.budget,
      budgetMin: insertProfile.budgetMin ?? null,
      budgetMax: insertProfile.budgetMax ?? null,
      homeType: insertProfile.homeType,
      bedrooms: insertProfile.bedrooms,
      bathrooms: insertProfile.bathrooms,
      mustHaveFeatures: insertProfile.mustHaveFeatures ? [...insertProfile.mustHaveFeatures] : [],
      dealbreakers: insertProfile.dealbreakers ? [...insertProfile.dealbreakers] : [],
      preferredAreas: insertProfile.preferredAreas ? [...insertProfile.preferredAreas] : [],
      lifestyleDrivers: insertProfile.lifestyleDrivers ? [...insertProfile.lifestyleDrivers] : [],
      specialNeeds: insertProfile.specialNeeds ? [...insertProfile.specialNeeds] : [],
      budgetFlexibility: insertProfile.budgetFlexibility ?? 50,
      locationFlexibility: insertProfile.locationFlexibility ?? 50,
      timingFlexibility: insertProfile.timingFlexibility ?? 50,
      emotionalContext: insertProfile.emotionalContext ?? null,
      voiceTranscript: insertProfile.voiceTranscript ?? null,
      inferredTags: insertProfile.inferredTags ? [...insertProfile.inferredTags] : [],
      emotionalTone: insertProfile.emotionalTone ?? null,
      priorityScore: insertProfile.priorityScore ?? 50,
      rawInput: insertProfile.rawInput,
      createdAt: new Date().toISOString()
    };
    this.profiles.set(id, profile);
    return profile;
  }

  async deleteBuyerProfile(id: number): Promise<void> {
    this.profiles.delete(id);
  }
}

export const storage = new MemStorage();

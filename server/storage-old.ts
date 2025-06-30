import { 
  buyerProfiles, 
  profileTags,
  profilePersona,
  type BuyerProfile, 
  type InsertBuyerProfile,
  type ProfileTag,
  type InsertProfileTag,
  type ProfilePersona,
  type InsertProfilePersona
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getBuyerProfile(id: number): Promise<BuyerProfile | undefined>;
  getAllBuyerProfiles(): Promise<BuyerProfile[]>;
  createBuyerProfile(profile: InsertBuyerProfile): Promise<BuyerProfile>;
  updateBuyerProfile(id: number, profile: Partial<InsertBuyerProfile>): Promise<BuyerProfile>;
  deleteBuyerProfile(id: number): Promise<void>;
  
  // Enhanced methods for tags and persona
  getProfileWithTags(id: number): Promise<(BuyerProfile & { tags: ProfileTag[], persona?: ProfilePersona }) | undefined>;
  createProfileTags(tags: InsertProfileTag[]): Promise<ProfileTag[]>;
  createProfilePersona(persona: InsertProfilePersona): Promise<ProfilePersona>;
  getProfileVersions(profileId: number): Promise<BuyerProfile[]>;
  createProfileVersion(profile: InsertBuyerProfile): Promise<BuyerProfile>;
}

export class DatabaseStorage implements IStorage {
  async getBuyerProfile(id: number): Promise<BuyerProfile | undefined> {
    const [profile] = await db.select().from(buyerProfiles).where(eq(buyerProfiles.id, id));
    return profile || undefined;
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
      email: insertProfile.email,
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
      inputMethod: insertProfile.inputMethod || "form",
      nlpConfidence: insertProfile.nlpConfidence || 100,
      version: insertProfile.version || 1,
      parentProfileId: insertProfile.parentProfileId || null,
      createdAt: new Date().toISOString()
    };
    this.profiles.set(id, profile);
    return profile;
  }

  async getProfileWithTags(id: number): Promise<(BuyerProfile & { tags: ProfileTag[], persona?: ProfilePersona }) | undefined> {
    const profile = this.profiles.get(id);
    if (!profile) return undefined;
    
    const tags = this.tags.get(id) || [];
    const persona = this.personas.get(id);
    
    return {
      ...profile,
      tags,
      persona
    };
  }

  async createProfileTags(tags: InsertProfileTag[]): Promise<ProfileTag[]> {
    const createdTags: ProfileTag[] = [];
    
    for (const insertTag of tags) {
      const tag: ProfileTag = {
        ...insertTag,
        id: this.currentTagId++,
        createdAt: new Date().toISOString(),
      };
      
      createdTags.push(tag);
      
      // Add to profile's tag collection
      const existingTags = this.tags.get(insertTag.profileId) || [];
      this.tags.set(insertTag.profileId, [...existingTags, tag]);
    }
    
    return createdTags;
  }

  async createProfilePersona(persona: InsertProfilePersona): Promise<ProfilePersona> {
    const createdPersona: ProfilePersona = {
      id: this.currentPersonaId++,
      profileId: persona.profileId,
      emotionalTone: persona.emotionalTone || null,
      communicationStyle: persona.communicationStyle || null,
      decisionMakingStyle: persona.decisionMakingStyle || null,
      urgencyLevel: persona.urgencyLevel || 50,
      priceOrientation: persona.priceOrientation || null,
      personalityTraits: persona.personalityTraits || [],
      confidenceScore: persona.confidenceScore,
      createdAt: new Date().toISOString(),
    };
    
    this.personas.set(persona.profileId, createdPersona);
    return createdPersona;
  }

  async getProfileVersions(profileId: number): Promise<BuyerProfile[]> {
    const versions: BuyerProfile[] = [];
    
    for (const profile of this.profiles.values()) {
      if (profile.id === profileId || profile.parentProfileId === profileId) {
        versions.push(profile);
      }
    }
    
    return versions.sort((a, b) => a.version - b.version);
  }

  async createProfileVersion(profile: InsertBuyerProfile): Promise<BuyerProfile> {
    // Find the latest version of this profile
    const existingVersions = await this.getProfileVersions(profile.parentProfileId || 0);
    const latestVersion = Math.max(...existingVersions.map(p => p.version), 0);
    
    const id = this.currentId++;
    const newProfile: BuyerProfile = {
      id,
      name: profile.name,
      email: profile.email,
      budget: profile.budget,
      budgetMin: profile.budgetMin ?? null,
      budgetMax: profile.budgetMax ?? null,
      homeType: profile.homeType,
      bedrooms: profile.bedrooms,
      bathrooms: profile.bathrooms,
      mustHaveFeatures: profile.mustHaveFeatures ? [...profile.mustHaveFeatures] : [],
      dealbreakers: profile.dealbreakers ? [...profile.dealbreakers] : [],
      preferredAreas: profile.preferredAreas ? [...profile.preferredAreas] : [],
      lifestyleDrivers: profile.lifestyleDrivers ? [...profile.lifestyleDrivers] : [],
      specialNeeds: profile.specialNeeds ? [...profile.specialNeeds] : [],
      budgetFlexibility: profile.budgetFlexibility ?? 50,
      locationFlexibility: profile.locationFlexibility ?? 50,
      timingFlexibility: profile.timingFlexibility ?? 50,
      emotionalContext: profile.emotionalContext ?? null,
      voiceTranscript: profile.voiceTranscript ?? null,
      inferredTags: profile.inferredTags ? [...profile.inferredTags] : [],
      emotionalTone: profile.emotionalTone ?? null,
      priorityScore: profile.priorityScore ?? 50,
      rawInput: profile.rawInput,
      inputMethod: profile.inputMethod || "form",
      nlpConfidence: profile.nlpConfidence || 100,
      version: latestVersion + 1,
      parentProfileId: profile.parentProfileId || null,
      createdAt: new Date().toISOString(),
    };
    
    this.profiles.set(newProfile.id, newProfile);
    return newProfile;
  }

  async deleteBuyerProfile(id: number): Promise<void> {
    this.profiles.delete(id);
    this.tags.delete(id);
    this.personas.delete(id);
  }
}

export const storage = new MemStorage();

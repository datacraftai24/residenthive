import { 
  buyerProfiles, 
  profileTags,
  profilePersona,
  agentInsightFeedback,
  agentActionFeedback,
  agentNotes,
  profileInsightsLock,
  type BuyerProfile, 
  type InsertBuyerProfile,
  type ProfileTag,
  type InsertProfileTag,
  type ProfilePersona,
  type InsertProfilePersona,
  type InsertAgentInsightFeedback,
  type InsertAgentActionFeedback,
  type InsertAgentNotes,
  type InsertProfileInsightsLock,
  type AgentNotes
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
  
  // Agent feedback methods
  logInsightFeedback(feedback: InsertAgentInsightFeedback): Promise<void>;
  logActionFeedback(feedback: InsertAgentActionFeedback): Promise<void>;
  saveAgentNote(note: InsertAgentNotes): Promise<void>;
  toggleInsightsLock(lock: InsertProfileInsightsLock): Promise<void>;
  getAgentNotes(profileId: number): Promise<AgentNotes[]>;
  getInsightsLockStatus(profileId: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getBuyerProfile(id: number): Promise<BuyerProfile | undefined> {
    const [profile] = await db.select().from(buyerProfiles).where(eq(buyerProfiles.id, id));
    return profile || undefined;
  }

  async getAllBuyerProfiles(): Promise<BuyerProfile[]> {
    const profiles = await db.select().from(buyerProfiles).orderBy(desc(buyerProfiles.createdAt));
    return profiles;
  }

  async createBuyerProfile(insertProfile: InsertBuyerProfile): Promise<BuyerProfile> {
    const [profile] = await db
      .insert(buyerProfiles)
      .values({
        ...insertProfile,
        createdAt: new Date().toISOString()
      })
      .returning();
    return profile;
  }

  async updateBuyerProfile(id: number, updates: Partial<InsertBuyerProfile>): Promise<BuyerProfile> {
    const [profile] = await db
      .update(buyerProfiles)
      .set(updates)
      .where(eq(buyerProfiles.id, id))
      .returning();
    return profile;
  }

  async getProfileWithTags(id: number): Promise<(BuyerProfile & { tags: ProfileTag[], persona?: ProfilePersona }) | undefined> {
    const profile = await this.getBuyerProfile(id);
    if (!profile) return undefined;

    const tags = await db.select().from(profileTags).where(eq(profileTags.profileId, id));
    const [persona] = await db.select().from(profilePersona).where(eq(profilePersona.profileId, id));

    return {
      ...profile,
      tags,
      persona
    };
  }

  async createProfileTags(tags: InsertProfileTag[]): Promise<ProfileTag[]> {
    if (tags.length === 0) return [];
    
    const tagsWithTimestamp = tags.map(tag => ({
      ...tag,
      createdAt: new Date().toISOString()
    }));
    
    const createdTags = await db
      .insert(profileTags)
      .values(tagsWithTimestamp)
      .returning();
    return createdTags;
  }

  async createProfilePersona(persona: InsertProfilePersona): Promise<ProfilePersona> {
    const [createdPersona] = await db
      .insert(profilePersona)
      .values({
        ...persona,
        createdAt: new Date().toISOString()
      })
      .returning();
    return createdPersona;
  }

  async getProfileVersions(profileId: number): Promise<BuyerProfile[]> {
    const versions = await db
      .select()
      .from(buyerProfiles)
      .where(eq(buyerProfiles.parentProfileId, profileId))
      .orderBy(desc(buyerProfiles.version));
    return versions;
  }

  async createProfileVersion(profile: InsertBuyerProfile): Promise<BuyerProfile> {
    const [newProfile] = await db
      .insert(buyerProfiles)
      .values({
        ...profile,
        createdAt: new Date().toISOString()
      })
      .returning();
    return newProfile;
  }

  async deleteBuyerProfile(id: number): Promise<void> {
    // Delete in proper order due to foreign key constraints
    await db.delete(agentInsightFeedback).where(eq(agentInsightFeedback.profileId, id));
    await db.delete(agentActionFeedback).where(eq(agentActionFeedback.profileId, id));
    await db.delete(agentNotes).where(eq(agentNotes.profileId, id));
    await db.delete(profileInsightsLock).where(eq(profileInsightsLock.profileId, id));
    await db.delete(profileTags).where(eq(profileTags.profileId, id));
    await db.delete(profilePersona).where(eq(profilePersona.profileId, id));
    await db.delete(buyerProfiles).where(eq(buyerProfiles.id, id));
  }

  // Agent feedback methods
  async logInsightFeedback(feedback: InsertAgentInsightFeedback): Promise<void> {
    await db.insert(agentInsightFeedback).values({
      ...feedback,
      createdAt: new Date().toISOString()
    });
  }

  async logActionFeedback(feedback: InsertAgentActionFeedback): Promise<void> {
    await db.insert(agentActionFeedback).values({
      ...feedback,
      createdAt: new Date().toISOString()
    });
  }

  async saveAgentNote(note: InsertAgentNotes): Promise<void> {
    await db.insert(agentNotes).values({
      ...note,
      createdAt: new Date().toISOString()
    });
  }

  async toggleInsightsLock(lock: InsertProfileInsightsLock): Promise<void> {
    // Use upsert pattern - insert or update if exists
    const existing = await db.select()
      .from(profileInsightsLock)
      .where(eq(profileInsightsLock.profileId, lock.profileId));
    
    if (existing.length > 0) {
      await db.update(profileInsightsLock)
        .set({ isLocked: lock.isLocked })
        .where(eq(profileInsightsLock.profileId, lock.profileId));
    } else {
      await db.insert(profileInsightsLock).values({
        ...lock,
        createdAt: new Date().toISOString()
      });
    }
  }

  async getAgentNotes(profileId: number): Promise<AgentNotes[]> {
    const notes = await db.select()
      .from(agentNotes)
      .where(eq(agentNotes.profileId, profileId))
      .orderBy(desc(agentNotes.createdAt));
    return notes;
  }

  async getInsightsLockStatus(profileId: number): Promise<boolean> {
    const [lock] = await db.select()
      .from(profileInsightsLock)
      .where(eq(profileInsightsLock.profileId, profileId));
    return lock ? Boolean(lock.isLocked) : false;
  }
}

export const storage = new DatabaseStorage();
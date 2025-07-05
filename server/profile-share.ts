import { randomUUID } from 'crypto';
import { db } from './db';
import { profileShareableLinks, type InsertProfileShareableLinks, type ProfileShareableLinks } from "@shared/schema";
import { eq } from 'drizzle-orm';

export interface ProfileShareData {
  profileId: number;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  customMessage?: string;
  brandingColors?: string; // JSON string
  showVisualAnalysis?: boolean;
  expiresInDays?: number;
}

export interface ShareableProfile {
  shareId: string;
  profileId: number;
  shareUrl: string;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  customMessage?: string;
  brandingColors?: string;
  showVisualAnalysis?: boolean;
  expiresAt?: string;
  isActive: boolean;
}

/**
 * Profile Shareable Service - One comprehensive link per client like Zillow
 * Shows all matching properties for a specific buyer profile with agent branding
 */
export class ProfileShareableService {
  /**
   * Create or update a shareable link for a buyer profile
   */
  async createShareableProfile(data: ProfileShareData): Promise<ShareableProfile> {
    // Check if profile already has an active share link
    const existingLink = await this.getActiveShareableProfile(data.profileId);
    
    if (existingLink) {
      // Update existing link instead of creating new one
      return this.updateShareableProfile(existingLink.shareId, data);
    }

    const shareId = randomUUID();
    const expiresAt = data.expiresInDays 
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const insertData: InsertProfileShareableLinks = {
      profileId: data.profileId,
      shareId,
      agentName: data.agentName,
      agentEmail: data.agentEmail,
      agentPhone: data.agentPhone,
      customMessage: data.customMessage,
      brandingColors: data.brandingColors,
      showVisualAnalysis: data.showVisualAnalysis ?? true,
      expiresAt,
      isActive: true
    };

    await db.insert(profileShareableLinks).values([{
      ...insertData,
      createdAt: new Date().toISOString()
    }]);

    return {
      shareId,
      profileId: data.profileId,
      shareUrl: this.buildShareUrl(shareId),
      agentName: data.agentName,
      agentEmail: data.agentEmail,
      agentPhone: data.agentPhone,
      customMessage: data.customMessage,
      brandingColors: data.brandingColors,
      showVisualAnalysis: data.showVisualAnalysis ?? true,
      expiresAt,
      isActive: true
    };
  }

  /**
   * Update an existing shareable profile
   */
  async updateShareableProfile(shareId: string, data: Partial<ProfileShareData>): Promise<ShareableProfile> {
    const updateData: Partial<ProfileShareableLinks> = {};
    
    if (data.agentName !== undefined) updateData.agentName = data.agentName;
    if (data.agentEmail !== undefined) updateData.agentEmail = data.agentEmail;
    if (data.agentPhone !== undefined) updateData.agentPhone = data.agentPhone;
    if (data.customMessage !== undefined) updateData.customMessage = data.customMessage;
    if (data.brandingColors !== undefined) updateData.brandingColors = data.brandingColors;
    if (data.showVisualAnalysis !== undefined) updateData.showVisualAnalysis = data.showVisualAnalysis;
    if (data.expiresInDays) {
      updateData.expiresAt = new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    }

    await db.update(profileShareableLinks)
      .set(updateData)
      .where(eq(profileShareableLinks.shareId, shareId));

    const [updated] = await db.select()
      .from(profileShareableLinks)
      .where(eq(profileShareableLinks.shareId, shareId));

    if (!updated) {
      throw new Error('Shareable profile not found');
    }

    return {
      shareId: updated.shareId,
      profileId: updated.profileId,
      shareUrl: this.buildShareUrl(updated.shareId),
      agentName: updated.agentName,
      agentEmail: updated.agentEmail,
      agentPhone: updated.agentPhone,
      customMessage: updated.customMessage,
      brandingColors: updated.brandingColors,
      showVisualAnalysis: updated.showVisualAnalysis,
      expiresAt: updated.expiresAt,
      isActive: updated.isActive
    };
  }

  /**
   * Get shareable profile data by share ID
   */
  async getShareableProfile(shareId: string): Promise<ShareableProfile | null> {
    const [result] = await db.select()
      .from(profileShareableLinks)
      .where(eq(profileShareableLinks.shareId, shareId));

    if (!result) {
      return null;
    }

    // Check if expired
    if (result.expiresAt && new Date(result.expiresAt) < new Date()) {
      return null;
    }

    // Increment view count
    await this.incrementViewCount(shareId);

    return {
      shareId: result.shareId,
      profileId: result.profileId,
      shareUrl: this.buildShareUrl(result.shareId),
      agentName: result.agentName,
      agentEmail: result.agentEmail,
      agentPhone: result.agentPhone,
      customMessage: result.customMessage,
      brandingColors: result.brandingColors,
      showVisualAnalysis: result.showVisualAnalysis,
      expiresAt: result.expiresAt,
      isActive: result.isActive
    };
  }

  /**
   * Get active shareable profile for a buyer profile ID
   */
  async getActiveShareableProfile(profileId: number): Promise<ShareableProfile | null> {
    const [result] = await db.select()
      .from(profileShareableLinks)
      .where(eq(profileShareableLinks.profileId, profileId));

    if (!result || !result.isActive) {
      return null;
    }

    // Check if expired
    if (result.expiresAt && new Date(result.expiresAt) < new Date()) {
      // Deactivate expired link
      await this.deactivateShareableProfile(result.shareId);
      return null;
    }

    return {
      shareId: result.shareId,
      profileId: result.profileId,
      shareUrl: this.buildShareUrl(result.shareId),
      agentName: result.agentName,
      agentEmail: result.agentEmail,
      agentPhone: result.agentPhone,
      customMessage: result.customMessage,
      brandingColors: result.brandingColors,
      showVisualAnalysis: result.showVisualAnalysis,
      expiresAt: result.expiresAt,
      isActive: result.isActive
    };
  }

  /**
   * Deactivate a shareable profile
   */
  async deactivateShareableProfile(shareId: string): Promise<void> {
    await db.update(profileShareableLinks)
      .set({ isActive: false })
      .where(eq(profileShareableLinks.shareId, shareId));
  }

  /**
   * Increment view count for analytics
   */
  private async incrementViewCount(shareId: string): Promise<void> {
    try {
      const [current] = await db.select({ viewCount: profileShareableLinks.viewCount })
        .from(profileShareableLinks)
        .where(eq(profileShareableLinks.shareId, shareId));

      if (current) {
        await db.update(profileShareableLinks)
          .set({ 
            viewCount: current.viewCount + 1,
            lastViewed: new Date().toISOString()
          })
          .where(eq(profileShareableLinks.shareId, shareId));
      }
    } catch (error) {
      console.error("Failed to increment view count:", error);
    }
  }

  /**
   * Build the full share URL
   */
  private buildShareUrl(shareId: string): string {
    const baseUrl = process.env.REPLIT_DOMAIN 
      ? `https://${process.env.REPLIT_DOMAIN}`
      : 'http://localhost:5000';
    
    return `${baseUrl}/client/${shareId}`;
  }

  /**
   * Generate WhatsApp sharing text for profile
   */
  generateWhatsAppText(profileName: string, shareableProfile: ShareableProfile): string {
    const message = `Hi ${profileName}! 

I've found some properties that match your criteria perfectly. 

${shareableProfile.customMessage || 'Take a look at these curated listings I selected specifically for you.'}

View your personalized property matches: ${shareableProfile.shareUrl}

${shareableProfile.agentName ? `Best regards,\n${shareableProfile.agentName}` : 'Best regards'}`;

    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  /**
   * Generate email sharing text for profile
   */
  generateEmailText(profileName: string, shareableProfile: ShareableProfile): { subject: string; body: string } {
    const subject = `Your Personalized Property Matches - ${profileName}`;
    
    const body = `Hi ${profileName},

I've curated a selection of properties that match your specific criteria and preferences.

${shareableProfile.customMessage || 'These listings have been carefully selected based on your requirements and our market analysis.'}

View your personalized property dashboard: ${shareableProfile.shareUrl}

This link includes:
• Properties matching your budget and preferences
• AI-powered visual analysis of each property
• Detailed comparisons showing how each property meets your criteria
• Photos and complete property details

${shareableProfile.agentName ? `Best regards,\n${shareableProfile.agentName}` : 'Best regards'}
${shareableProfile.agentEmail ? `${shareableProfile.agentEmail}` : ''}
${shareableProfile.agentPhone ? `${shareableProfile.agentPhone}` : ''}`;

    return { subject, body };
  }

  /**
   * Get analytics for a shareable profile
   */
  async getShareAnalytics(shareId: string): Promise<{ viewCount: number; lastViewed?: string; createdAt: string } | null> {
    const [result] = await db.select({
      viewCount: profileShareableLinks.viewCount,
      lastViewed: profileShareableLinks.lastViewed,
      createdAt: profileShareableLinks.createdAt
    })
    .from(profileShareableLinks)
    .where(eq(profileShareableLinks.shareId, shareId));

    return result || null;
  }
}

export const profileShareableService = new ProfileShareableService();
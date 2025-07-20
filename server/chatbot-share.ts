import { randomUUID } from 'crypto';
import { db } from './db';
import { chatbotShareableLinks, type InsertChatbotShareableLinks, type ChatbotShareableLinks } from "@shared/schema";
import { eq } from 'drizzle-orm';

export interface ChatbotShareData {
  profileId: number;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  customMessage?: string;
  brandingColors?: string; // JSON string
  chatbotTitle?: string;
  chatbotDescription?: string;
  expiresInDays?: number;
}

export interface ShareableChatbot {
  shareId: string;
  profileId: number;
  shareUrl: string;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  customMessage?: string;
  brandingColors?: string;
  chatbotTitle: string;
  chatbotDescription: string;
  expiresAt?: string;
  isActive: boolean;
}

/**
 * Chatbot Shareable Service - Individual chatbot links per buyer
 * Creates personalized chatbot experiences for each client with their profile data
 */
export class ChatbotShareableService {
  /**
   * Create or update a shareable chatbot link for a buyer profile
   */
  async createShareableChatbot(data: ChatbotShareData): Promise<ShareableChatbot> {
    // Check if profile already has an active chatbot link
    const existingLink = await this.getActiveShareableChatbot(data.profileId);
    
    if (existingLink) {
      // Update existing link instead of creating new one
      return this.updateShareableChatbot(existingLink.shareId, data);
    }

    const shareId = randomUUID();
    const expiresAt = data.expiresInDays 
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const insertData: InsertChatbotShareableLinks = {
      profileId: data.profileId,
      shareId,
      agentName: data.agentName,
      agentEmail: data.agentEmail,
      agentPhone: data.agentPhone,
      customMessage: data.customMessage,
      brandingColors: data.brandingColors,
      chatbotTitle: data.chatbotTitle || "Your Personal Real Estate Assistant",
      chatbotDescription: data.chatbotDescription || "Ask me anything about properties, neighborhoods, or real estate! I'm here to help you find your perfect home.",
      expiresAt,
      isActive: true
    };

    await db.insert(chatbotShareableLinks).values([{
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
      chatbotTitle: data.chatbotTitle || "Your Personal Real Estate Assistant",
      chatbotDescription: data.chatbotDescription || "Ask me anything about properties, neighborhoods, or real estate! I'm here to help you find your perfect home.",
      expiresAt,
      isActive: true
    };
  }

  /**
   * Update an existing shareable chatbot
   */
  async updateShareableChatbot(shareId: string, data: Partial<ChatbotShareData>): Promise<ShareableChatbot> {
    const updateData: Partial<ChatbotShareableLinks> = {};
    
    if (data.agentName !== undefined) updateData.agentName = data.agentName;
    if (data.agentEmail !== undefined) updateData.agentEmail = data.agentEmail;
    if (data.agentPhone !== undefined) updateData.agentPhone = data.agentPhone;
    if (data.customMessage !== undefined) updateData.customMessage = data.customMessage;
    if (data.brandingColors !== undefined) updateData.brandingColors = data.brandingColors;
    if (data.chatbotTitle !== undefined) updateData.chatbotTitle = data.chatbotTitle;
    if (data.chatbotDescription !== undefined) updateData.chatbotDescription = data.chatbotDescription;
    if (data.expiresInDays) {
      updateData.expiresAt = new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    }

    await db.update(chatbotShareableLinks)
      .set(updateData)
      .where(eq(chatbotShareableLinks.shareId, shareId));

    const [updated] = await db.select()
      .from(chatbotShareableLinks)
      .where(eq(chatbotShareableLinks.shareId, shareId));

    if (!updated) {
      throw new Error('Shareable chatbot not found');
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
      chatbotTitle: updated.chatbotTitle,
      chatbotDescription: updated.chatbotDescription,
      expiresAt: updated.expiresAt,
      isActive: updated.isActive
    };
  }

  /**
   * Get shareable chatbot data by share ID
   */
  async getShareableChatbot(shareId: string): Promise<ShareableChatbot | null> {
    const [result] = await db.select()
      .from(chatbotShareableLinks)
      .where(eq(chatbotShareableLinks.shareId, shareId));

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
      chatbotTitle: result.chatbotTitle,
      chatbotDescription: result.chatbotDescription,
      expiresAt: result.expiresAt,
      isActive: result.isActive
    };
  }

  /**
   * Get active shareable chatbot for a buyer profile ID
   */
  async getActiveShareableChatbot(profileId: number): Promise<ShareableChatbot | null> {
    const [result] = await db.select()
      .from(chatbotShareableLinks)
      .where(eq(chatbotShareableLinks.profileId, profileId));

    if (!result || !result.isActive) {
      return null;
    }

    // Check if expired
    if (result.expiresAt && new Date(result.expiresAt) < new Date()) {
      // Deactivate expired link
      await this.deactivateShareableChatbot(result.shareId);
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
      chatbotTitle: result.chatbotTitle,
      chatbotDescription: result.chatbotDescription,
      expiresAt: result.expiresAt,
      isActive: result.isActive
    };
  }

  /**
   * Deactivate a shareable chatbot
   */
  async deactivateShareableChatbot(shareId: string): Promise<boolean> {
    try {
      await db.update(chatbotShareableLinks)
        .set({ isActive: false })
        .where(eq(chatbotShareableLinks.shareId, shareId));
      return true;
    } catch (error) {
      console.error('Error deactivating shareable chatbot:', error);
      return false;
    }
  }

  /**
   * Increment view count for a shareable chatbot
   */
  private async incrementViewCount(shareId: string): Promise<void> {
    try {
      await db.update(chatbotShareableLinks)
        .set({ 
          viewCount: db.raw('view_count + 1'),
          lastViewed: new Date().toISOString()
        })
        .where(eq(chatbotShareableLinks.shareId, shareId));
    } catch (error) {
      console.error('Error incrementing view count:', error);
    }
  }

  /**
   * Build the full share URL
   */
  private buildShareUrl(shareId: string): string {
    // Use REPLIT_DOMAINS for deployed environments
    const deploymentDomain = process.env.REPLIT_DOMAINS;
    
    let baseUrl: string;
    
    if (deploymentDomain) {
      // Use the deployed domain directly
      baseUrl = `https://${deploymentDomain}`;
    } else {
      // Development environment
      baseUrl = 'http://localhost:3000';
    }
    
    return `${baseUrl}/chatbot/${shareId}`;
  }

  /**
   * Generate WhatsApp sharing text for chatbot
   */
  generateWhatsAppText(profileName: string, shareableChatbot: ShareableChatbot): string {
    const message = `Hi ${profileName}! 

I've created a personalized AI assistant just for you to help with your real estate search. 

${shareableChatbot.customMessage || 'This chatbot knows your preferences and can help you find the perfect home.'}

Chat with your personal AI assistant: ${shareableChatbot.shareUrl}

${shareableChatbot.agentName ? `Best regards,\n${shareableChatbot.agentName}` : 'Best regards'}`;

    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
}

// Global service instance
export const chatbotShareableService = new ChatbotShareableService(); 
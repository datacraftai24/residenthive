import { db } from "./db";
import { listingShareableLinks, type InsertListingShareableLinks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface ShareableListing {
  shareId: string;
  listingId: string;
  shareUrl: string;
  agentName?: string;
  agentEmail?: string;
  customMessage?: string;
  expiresAt?: string;
}

export interface ListingShareData {
  listingId: string;
  profileId?: number;
  agentName?: string;
  agentEmail?: string;
  customMessage?: string;
  expiresInDays?: number;
}

/**
 * Shareable Listing Service
 * Creates Zillow-like shareable links for property listings with agent branding
 */
export class ShareableListingService {

  /**
   * Create a shareable link for a listing
   */
  async createShareableLink(data: ListingShareData): Promise<ShareableListing> {
    const shareId = randomUUID();
    const expiresAt = data.expiresInDays 
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const insertData: InsertListingShareableLinks = {
      listingId: data.listingId,
      shareId,
      profileId: data.profileId,
      agentName: data.agentName,
      agentEmail: data.agentEmail,
      customMessage: data.customMessage,
      expiresAt,
      createdAt: new Date().toISOString()
    };

    await db.insert(listingShareableLinks).values([insertData]);

    return {
      shareId,
      listingId: data.listingId,
      shareUrl: this.buildShareUrl(shareId),
      agentName: data.agentName,
      agentEmail: data.agentEmail,
      customMessage: data.customMessage,
      expiresAt
    };
  }

  /**
   * Get shareable listing data by share ID
   */
  async getShareableListing(shareId: string): Promise<ShareableListing | null> {
    const [result] = await db
      .select()
      .from(listingShareableLinks)
      .where(eq(listingShareableLinks.shareId, shareId));

    if (!result) return null;

    // Check if expired
    if (result.expiresAt && new Date(result.expiresAt) < new Date()) {
      return null;
    }

    // Update view count
    await this.incrementViewCount(shareId);

    return {
      shareId: result.shareId,
      listingId: result.listingId,
      shareUrl: this.buildShareUrl(result.shareId),
      agentName: result.agentName || undefined,
      agentEmail: result.agentEmail || undefined,
      customMessage: result.customMessage || undefined,
      expiresAt: result.expiresAt || undefined
    };
  }

  /**
   * Increment view count for analytics
   */
  private async incrementViewCount(shareId: string): Promise<void> {
    try {
      // Get current count and increment
      const [current] = await db
        .select({ viewCount: listingShareableLinks.viewCount })
        .from(listingShareableLinks)
        .where(eq(listingShareableLinks.shareId, shareId));
      
      if (current) {
        await db
          .update(listingShareableLinks)
          .set({ 
            viewCount: current.viewCount + 1,
            lastViewed: new Date().toISOString()
          })
          .where(eq(listingShareableLinks.shareId, shareId));
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
    
    return `${baseUrl}/share/${shareId}`;
  }

  /**
   * Generate agent-ready copy-paste text for sharing
   */
  generateAgentCopyText(listing: any, shareableListing: ShareableListing, visualTags?: string[]): string {
    const priceFormatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(listing.price);

    const features = [];
    
    // Add basic features
    if (listing.bedrooms) features.push(`${listing.bedrooms}BR`);
    if (listing.bathrooms) features.push(`${listing.bathrooms}BA`);
    if (listing.square_feet) features.push(`${listing.square_feet.toLocaleString()} sqft`);

    // Add visual features if available
    if (visualTags?.length) {
      const displayTags = visualTags
        .filter(tag => !tag.includes('_'))
        .map(tag => tag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
        .slice(0, 3);
      features.push(...displayTags);
    }

    // Add listing features
    if (listing.features?.length) {
      features.push(...listing.features.slice(0, 2));
    }

    const featureText = features.length > 0 ? `✅ ${features.join(', ')}` : '';
    const agentText = shareableListing.agentName 
      ? `\n👤 ${shareableListing.agentName}` 
      : '';
    const customText = shareableListing.customMessage 
      ? `\n💬 ${shareableListing.customMessage}` 
      : '';

    return `🏡 ${listing.address} – ${priceFormatted}
${featureText}${agentText}${customText}

🔗 View Details: ${shareableListing.shareUrl}`;
  }

  /**
   * Generate WhatsApp-ready sharing text
   */
  generateWhatsAppText(listing: any, shareableListing: ShareableListing): string {
    const copyText = this.generateAgentCopyText(listing, shareableListing);
    // URL encode for WhatsApp
    return `https://wa.me/?text=${encodeURIComponent(copyText)}`;
  }

  /**
   * Generate email-ready sharing text
   */
  generateEmailText(listing: any, shareableListing: ShareableListing): { subject: string; body: string } {
    const priceFormatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(listing.price);

    const subject = `Property Recommendation: ${listing.address} - ${priceFormatted}`;
    
    const body = `Hi there!

I found a property that might interest you:

${listing.address}
${priceFormatted} • ${listing.bedrooms}BR/${listing.bathrooms}BA

${shareableListing.customMessage || 'This property matches your search criteria and I think it would be perfect for you.'}

View full details and photos: ${shareableListing.shareUrl}

${shareableListing.agentName ? `Best regards,\n${shareableListing.agentName}` : 'Best regards'}`;

    return { subject, body };
  }

  /**
   * Get analytics for a shareable link
   */
  async getShareAnalytics(shareId: string): Promise<{ viewCount: number; lastViewed?: string; createdAt: string } | null> {
    const [result] = await db
      .select({
        viewCount: listingShareableLinks.viewCount,
        lastViewed: listingShareableLinks.lastViewed,
        createdAt: listingShareableLinks.createdAt
      })
      .from(listingShareableLinks)
      .where(eq(listingShareableLinks.shareId, shareId));

    if (!result) return null;

    return {
      viewCount: result.viewCount,
      lastViewed: result.lastViewed || undefined,
      createdAt: result.createdAt
    };
  }
}

export const shareableListingService = new ShareableListingService();
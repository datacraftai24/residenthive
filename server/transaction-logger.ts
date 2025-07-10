import { db } from "./db";
import { 
  searchTransactions, 
  searchTransactionResults, 
  agentInteractions, 
  searchOutcomes,
  type InsertSearchTransaction,
  type InsertSearchTransactionResults,
  type InsertAgentInteraction,
  type InsertSearchOutcome,
  type BuyerProfile
} from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';

export interface SearchTransactionData {
  profileId: number;
  profile: BuyerProfile;
  searchParameters: any;
  searchMethod: 'enhanced' | 'basic' | 'hybrid';
  searchTrigger: 'agent_initiated' | 'profile_update' | 'refinement';
  sessionId?: string;
}

export interface SearchResultsData {
  rawListings: any[];
  scoredListings: any[];
  categorizedResults: {
    top_picks: any[];
    other_matches: any[];
    properties_without_images?: any[];
  };
  visualAnalysisData?: any[];
  searchSummary: any;
  chatBlocks?: string[];
  executionMetrics: {
    totalTime: number;
    apiCalls: number;
    visualAnalysisTime?: number;
  };
}

export interface AgentInteractionData {
  interactionType: 'property_clicked' | 'score_adjusted' | 'message_edited' | 'property_shared' | 'search_refined';
  listingId?: string;
  interactionData: any;
  sessionDuration?: number;
  agentConfidence?: number;
}

export interface SearchOutcomeData {
  propertiesClicked?: string[];
  propertiesSaved?: string[];
  propertiesShared?: string[];
  agentSatisfactionRating?: number;
  searchQualityRating?: number;
  agentNotes?: string;
  searchRefinementNeeded?: boolean;
  clientMeetingScheduled?: boolean;
  totalSessionTime?: number;
  mostViewedListings?: Array<{listing_id: string, time_spent: number}>;
}

/**
 * Core Transaction Logging Service - Phase 1 Implementation
 * Captures complete search transactions for machine learning and system improvement
 */
export class TransactionLogger {
  
  /**
   * Start a new search transaction and return the transaction ID
   */
  async startSearchTransaction(data: SearchTransactionData): Promise<string> {
    const transactionId = uuidv4();
    const timestamp = new Date().toISOString();
    
    // Calculate score distribution from previous searches for baseline metrics
    const scoreDistribution = this.calculateScoreDistribution([]);
    
    const transactionData: InsertSearchTransaction = {
      transactionId,
      profileId: data.profileId,
      sessionId: data.sessionId || uuidv4(),
      
      // Search Input Context
      profileSnapshot: data.profile,
      searchParameters: data.searchParameters,
      searchMethod: data.searchMethod,
      searchTrigger: data.searchTrigger,
      
      // Initialize with zeros - will be updated when results are saved
      rawListingsCount: 0,
      scoredListingsCount: 0,
      topPicksCount: 0,
      otherMatchesCount: 0,
      noImageCount: 0,
      visualAnalysisCount: 0,
      
      // Initialize execution metrics
      totalExecutionTime: 0,
      apiCallsCount: 0,
      
      // Initialize quality metrics
      averageScore: "0",
      scoreDistribution: scoreDistribution,
      dealbreakerPropertiesCount: 0
    };
    
    await db.insert(searchTransactions).values({
      ...transactionData,
      createdAt: timestamp
    });
    
    console.log(`🔍 Started search transaction: ${transactionId} for profile ${data.profileId}`);
    return transactionId;
  }
  
  /**
   * Save complete search results data
   */
  async saveSearchResults(transactionId: string, resultsData: SearchResultsData): Promise<void> {
    const timestamp = new Date().toISOString();
    
    // Calculate metrics from results
    const averageScore = this.calculateAverageScore(resultsData.scoredListings);
    const scoreDistribution = this.calculateScoreDistribution(resultsData.scoredListings);
    const dealbreakerCount = this.countDealbreakerProperties(resultsData.scoredListings);
    
    // Update search transaction with results metrics
    await db.update(searchTransactions)
      .set({
        rawListingsCount: resultsData.rawListings.length,
        scoredListingsCount: resultsData.scoredListings.length,
        topPicksCount: resultsData.categorizedResults.top_picks.length,
        otherMatchesCount: resultsData.categorizedResults.other_matches.length,
        noImageCount: resultsData.categorizedResults.properties_without_images?.length || 0,
        visualAnalysisCount: resultsData.visualAnalysisData?.length || 0,
        totalExecutionTime: resultsData.executionMetrics.totalTime,
        apiCallsCount: resultsData.executionMetrics.apiCalls,
        visualAnalysisTime: resultsData.executionMetrics.visualAnalysisTime,
        averageScore: averageScore.toString(),
        scoreDistribution: scoreDistribution,
        dealbreakerPropertiesCount: dealbreakerCount
      })
      .where(eq(searchTransactions.transactionId, transactionId));
    
    // Save detailed results data
    const topResults = resultsData.scoredListings
      .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
      .slice(0, 20); // Keep top 20 for learning
    
    const resultsRecord: InsertSearchTransactionResults = {
      transactionId,
      topResults: topResults,
      topPicksData: resultsData.categorizedResults.top_picks,
      otherMatchesData: resultsData.categorizedResults.other_matches,
      visualAnalysisData: resultsData.visualAnalysisData || null,
      searchSummary: resultsData.searchSummary,
      chatBlocks: resultsData.chatBlocks || null
    };
    
    await db.insert(searchTransactionResults).values({
      ...resultsRecord,
      createdAt: timestamp
    });
    
    console.log(`💾 Saved search results for transaction: ${transactionId} (${resultsData.scoredListings.length} properties)`);
  }
  
  /**
   * Log an agent interaction during the search session
   */
  async logAgentInteraction(transactionId: string, profileId: number, interaction: AgentInteractionData): Promise<void> {
    const timestamp = new Date().toISOString();
    
    const interactionRecord: InsertAgentInteraction = {
      transactionId,
      profileId,
      interactionType: interaction.interactionType,
      listingId: interaction.listingId || null,
      interactionData: interaction.interactionData,
      sessionDuration: interaction.sessionDuration || null,
      agentConfidence: interaction.agentConfidence || null
    };
    
    await db.insert(agentInteractions).values({
      ...interactionRecord,
      createdAt: timestamp
    });
    
    console.log(`👤 Logged agent interaction: ${interaction.interactionType} for transaction ${transactionId}`);
  }
  
  /**
   * Save search outcomes and agent feedback
   */
  async saveSearchOutcomes(transactionId: string, profileId: number, outcomes: SearchOutcomeData): Promise<void> {
    const timestamp = new Date().toISOString();
    
    const outcomeRecord: InsertSearchOutcome = {
      transactionId,
      profileId,
      propertiesClicked: outcomes.propertiesClicked || null,
      propertiesSaved: outcomes.propertiesSaved || null,
      propertiesShared: outcomes.propertiesShared || null,
      agentSatisfactionRating: outcomes.agentSatisfactionRating || null,
      searchQualityRating: outcomes.searchQualityRating || null,
      agentNotes: outcomes.agentNotes || null,
      searchRefinementNeeded: outcomes.searchRefinementNeeded || false,
      clientMeetingScheduled: outcomes.clientMeetingScheduled || false,
      totalSessionTime: outcomes.totalSessionTime || null,
      mostViewedListings: outcomes.mostViewedListings || null
    };
    
    await db.insert(searchOutcomes).values({
      ...outcomeRecord,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    
    console.log(`📊 Saved search outcomes for transaction: ${transactionId}`);
  }
  
  /**
   * Update search outcomes (for follow-up data)
   */
  async updateSearchOutcomes(transactionId: string, outcomes: Partial<SearchOutcomeData>): Promise<void> {
    const timestamp = new Date().toISOString();
    
    await db.update(searchOutcomes)
      .set({
        ...outcomes,
        updatedAt: timestamp
      })
      .where(eq(searchOutcomes.transactionId, transactionId));
    
    console.log(`🔄 Updated search outcomes for transaction: ${transactionId}`);
  }
  
  /**
   * Get complete transaction data for analysis
   */
  async getTransactionData(transactionId: string) {
    const transaction = await db.query.searchTransactions.findFirst({
      where: eq(searchTransactions.transactionId, transactionId),
    });
    
    const results = await db.query.searchTransactionResults.findFirst({
      where: eq(searchTransactionResults.transactionId, transactionId),
    });
    
    const interactions = await db.query.agentInteractions.findMany({
      where: eq(agentInteractions.transactionId, transactionId),
    });
    
    const outcomes = await db.query.searchOutcomes.findFirst({
      where: eq(searchOutcomes.transactionId, transactionId),
    });
    
    return {
      transaction,
      results,
      interactions,
      outcomes
    };
  }
  
  /**
   * Get recent transactions for a profile (for pattern analysis)
   */
  async getProfileTransactions(profileId: number, limit: number = 10) {
    return await db.query.searchTransactions.findMany({
      where: eq(searchTransactions.profileId, profileId),
      orderBy: (transactions, { desc }) => [desc(transactions.createdAt)],
      limit
    });
  }
  
  // Helper methods for calculating metrics
  
  private calculateAverageScore(scoredListings: any[]): number {
    if (!scoredListings || scoredListings.length === 0) return 0;
    
    const totalScore = scoredListings.reduce((sum, listing) => {
      return sum + (listing.score_breakdown?.final_score || listing.match_score * 100 || 0);
    }, 0);
    
    return Math.round((totalScore / scoredListings.length) * 100) / 100;
  }
  
  private calculateScoreDistribution(scoredListings: any[]): any {
    const distribution = {
      "excellent": 0, // 85+
      "good": 0,      // 70-84
      "fair": 0,      // 55-69
      "poor": 0,      // 40-54
      "not_recommended": 0 // <40
    };
    
    scoredListings.forEach(listing => {
      const score = listing.score_breakdown?.final_score || listing.match_score * 100 || 0;
      if (score >= 85) distribution.excellent++;
      else if (score >= 70) distribution.good++;
      else if (score >= 55) distribution.fair++;
      else if (score >= 40) distribution.poor++;
      else distribution.not_recommended++;
    });
    
    return distribution;
  }
  
  private countDealbreakerProperties(scoredListings: any[]): number {
    return scoredListings.filter(listing => 
      listing.dealbreaker_flags && listing.dealbreaker_flags.length > 0
    ).length;
  }
}

// Import eq from drizzle-orm for database queries
import { eq } from "drizzle-orm";

export const transactionLogger = new TransactionLogger();
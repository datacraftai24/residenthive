/**
 * Agent Insights Schema
 * 
 * This is the GOLD MINE - real agent knowledge about:
 * - Client personality and motivations
 * - Local market insights only agents know
 * - Off-market opportunities
 * - Neighborhood dynamics
 * - Timing considerations
 * - Red flags and concerns
 */

import { pgTable, text, integer, timestamp, jsonb, boolean, uuid } from 'drizzle-orm/pg-core';

export const agentInsights = pgTable('agent_insights', {
  id: uuid('id').defaultRandom().primaryKey(),
  
  // Links
  profileId: integer('profile_id').references(() => buyerProfiles.id),
  agentId: text('agent_id'), // Link to agent if we have auth
  sessionId: text('session_id').notNull(), // Chat session ID
  
  // Client Insights (Agent's unique knowledge)
  clientPersonality: text('client_personality'), // "Very analytical, needs data to feel comfortable"
  clientMotivations: text('client_motivations'), // "Wants to prove to family he can succeed"
  decisionStyle: text('decision_style'), // "Will overthink unless pushed"
  hiddenConcerns: text('hidden_concerns'), // "Worried about managing tenants but won't admit it"
  
  // Local Market Intelligence (Can't get from Zillow!)
  offMarketOpportunities: text('off_market_opportunities'), // "Mrs. Johnson on Oak St considering selling"
  neighborhoodDynamics: text('neighborhood_dynamics'), // "College expanding this way in 2 years"
  localDevelopmentPlans: text('local_development_plans'), // "New Amazon facility breaking ground Q3"
  timingConsiderations: text('timing_considerations'), // "Inventory always drops in February here"
  
  // Strategic Recommendations
  recommendedStrategy: text('recommended_strategy'), // Agent's specific strategy
  whyThisStrategy: text('why_this_strategy'), // Reasoning based on client + market
  alternativeApproaches: jsonb('alternative_approaches'), // Plan B, Plan C
  
  // Risk Assessment
  redFlags: jsonb('red_flags'), // Array of concerns
  mitigationStrategies: text('mitigation_strategies'), // How to handle the risks
  
  // Relationship Intelligence  
  sellerMotivations: text('seller_motivations'), // "Sellers in this area respond to..."
  negotiationTips: text('negotiation_tips'), // "Don't lowball, they get offended"
  
  // Follow-up Actions
  nextSteps: jsonb('next_steps'), // What agent will do
  agentCommitments: text('agent_commitments'), // "I'll talk to the listing agent"
  
  // Raw conversation for context
  fullConversation: jsonb('full_conversation'), // Complete chat history
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  
  // Quality markers
  insightQuality: text('insight_quality'), // 'high', 'medium', 'low'
  hasOffMarketInfo: boolean('has_off_market_info').default(false),
  hasLocalIntelligence: boolean('has_local_intelligence').default(false)
});

// For buyerProfiles reference
import { buyerProfiles } from '@shared/schema';

export type AgentInsight = typeof agentInsights.$inferSelect;
export type NewAgentInsight = typeof agentInsights.$inferInsert;
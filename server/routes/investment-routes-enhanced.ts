/**
 * Enhanced Investment Strategy API Routes
 * 
 * Features:
 * - Simplified chat that captures agent insights
 * - Raw conversation passed to AI Investment Advisor
 * - Agent insights persisted and used by Strategy Agent
 */

import { Router } from 'express';
import { db } from '../db';
import { buyerProfiles, investmentStrategies } from '@shared/schema';
import { simplifiedInvestmentChatService } from '../services/investment-chat-simplified';
import { enhancedInvestmentStrategy } from '../services/investment-strategy-enhanced';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';

const router = Router();

// Session storage (in production, use Redis or similar)
const chatSessions = new Map<string, any>();

/**
 * Enhanced investment chat endpoint
 * Focuses on gathering info and capturing agent insights
 */
router.post('/api/investment-chat-enhanced', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    // Get existing session if it exists
    const session = chatSessions.get(sessionId);
    
    // Process message with simplified service (pass sessionId, not session object)
    const response = await simplifiedInvestmentChatService.processMessage(message, sessionId);
    
    // Store updated session
    if (response.type === 'question') {
      chatSessions.set(response.sessionId, {
        sessionId: response.sessionId,
        messages: session?.messages || [],
        questionsAsked: (session?.questionsAsked || 0) + 1,
        hasAskedForInsights: session?.hasAskedForInsights || false
      });
    }
    
    // If ready, trigger strategy generation
    if (response.type === 'ready' && response.rawConversation) {
      console.log('🚀 Starting enhanced strategy generation...');
      
      // Parse profile from conversation - deterministic extraction
      const { parseAndValidateProfile } = await import('../services/profile-parser.js');
      let parsedProfile;
      try {
        // Parse the rawConversation to get structured data that chat service already extracted
        let parsedConversation;
        try {
          parsedConversation = JSON.parse(response.rawConversation);
        } catch (e) {
          console.error('Failed to parse rawConversation:', e);
          throw new Error('Invalid conversation format');
        }
        
        console.log('📝 Using structured data from chat service:', {
          budget: parsedConversation.structured?.detectedBudget,
          location: parsedConversation.structured?.detectedLocation
        });
        
        // Use the structured data that chat service already extracted
        if (parsedConversation.structured?.detectedBudget) {
          parsedProfile = {
            budget_usd: parsedConversation.structured.detectedBudget,
            location_city: normalizeCity(parsedConversation.structured.detectedLocation || 'Massachusetts'),
            monthly_income_target: parsedConversation.structured.wantsCashFlow ? 500 : undefined
          };
          
          // Validate using our strict validator
          const { assertProfile } = await import('../services/profile-parser.js');
          assertProfile(parsedProfile);
        } else {
          // This shouldn't happen if chat service is working
          throw new Error('Chat service did not extract budget/location');
        }
      } catch (error) {
        console.error('❌ Profile parsing failed:', error);
        return res.status(400).json({ 
          error: 'Invalid profile data',
          message: error.message 
        });
      }
      
      // Helper function
      function normalizeCity(location: string): string {
        if (!location || location.toLowerCase() === 'massachusetts') {
          return 'Worcester, MA';
        }
        if (!location.includes(',')) return `${location}, MA`;
        return location;
      }
      
      // Map to expected format for downstream services
      const profile = {
        budget: parsedProfile.budget_usd,
        location: parsedProfile.location_city,
        monthlyIncomeTarget: parsedProfile.monthly_income_target || 0,
        investorType: 'first_time' as const
      };
      
      // Get agent insights for this session
      const agentInsights = await simplifiedInvestmentChatService.getAgentInsights(response.sessionId);
      console.log('💎 Retrieved agent insights:', {
        hasOffMarket: !!agentInsights?.offMarketOpportunities,
        hasLocalIntel: !!agentInsights?.neighborhoodDynamics,
        quality: agentInsights?.insightQuality
      });
      
      // Generate strategy ID for tracking
      const strategyId = uuidv4();
      
      // Create strategy record
      await db.insert(investmentStrategies).values({
        profileId: 1, // Add a dummy profile ID (integer) for now
        sessionId: strategyId,
        status: 'generating',
        strategyJson: {},
        marketAnalysis: {},
        propertyRecommendations: [],
        financialProjections: {},
        generationTime: 0,
        dataSourcesUsed: ['research_coordinator', 'smart_research', 'tavily'],
        createdAt: new Date().toISOString()
      });
      
      // Trigger async enhanced strategy generation
      enhancedInvestmentStrategy.generateStrategy(profile, strategyId)
        .then(async () => {
          console.log('✅ Enhanced strategy generation complete');
          
          // Clean up session
          chatSessions.delete(response.sessionId);
        })
        .catch(error => {
          console.error('❌ Enhanced analysis failed:', error);
        });
      
      // Return immediately with strategy ID
      res.json({
        ...response,
        strategyId,
        message: response.message + ` Your strategy ID is ${strategyId}.`
      });
    } else {
      res.json(response);
    }
    
  } catch (error) {
    console.error('Enhanced chat error:', error);
    res.status(500).json({ 
      error: 'Failed to process message',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get agent insights for a session
 */
router.get('/api/agent-insights/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const insights = await simplifiedInvestmentChatService.getAgentInsights(sessionId);
    
    if (!insights) {
      return res.status(404).json({ error: 'No insights found for session' });
    }
    
    res.json({
      insights,
      quality: insights.insightQuality,
      hasOffMarketInfo: insights.hasOffMarketInfo,
      hasLocalIntelligence: insights.hasLocalIntelligence
    });
    
  } catch (error) {
    console.error('Get insights error:', error);
    res.status(500).json({ error: 'Failed to retrieve insights' });
  }
});

/**
 * Test endpoint - simulate agent conversation
 */
router.post('/api/test-enhanced-chat', async (req, res) => {
  try {
    const testMessages = [
      "I have a client named John who has about 50k saved up for investment.",
      "He's looking in Springfield, MA area and wants rental income. Timeline is next 3-6 months.",
      "John is pretty conservative, first-time investor. Wants something he doesn't have to manage himself.",
      "He definitely needs at least 2 units to make the numbers work. No properties needing major rehab.",
      "Based on my experience with John, he's very analytical and needs to see all the numbers. I think a duplex near the colleges would be perfect - stable tenants and appreciation. There's actually a pocket near State Street that's about to boom - the city is putting in a new transit line next year that hasn't been announced yet. Also, Mrs. Peterson on Maple Ave mentioned she might sell her 3-family if the right buyer came along - she wants $285k but would probably take $270k cash."
    ];
    
    let session;
    let lastResponse;
    
    for (const message of testMessages) {
      console.log(`\n🗣️ Agent: ${message.substring(0, 100)}...`);
      
      lastResponse = await simplifiedInvestmentChatService.processMessage(message, session);
      
      console.log(`🤖 Assistant: ${lastResponse.message.substring(0, 100)}...`);
      
      if (lastResponse.type === 'question') {
        session = {
          sessionId: lastResponse.sessionId,
          messages: [...(session?.messages || []), 
            { role: 'agent', content: message, timestamp: new Date() },
            { role: 'assistant', content: lastResponse.message, timestamp: new Date() }
          ],
          questionsAsked: (session?.questionsAsked || 0) + 1,
          hasAskedForInsights: session?.hasAskedForInsights || message.includes('Based on my experience')
        };
      }
    }
    
    res.json({
      message: 'Test completed',
      finalResponse: lastResponse,
      sessionId: lastResponse?.sessionId
    });
    
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ error: 'Test failed' });
  }
});

export default router;
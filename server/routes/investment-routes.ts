/**
 * Investment Strategy API Routes
 * 
 * Endpoints for investment chat and strategy generation
 */

import { Router } from 'express';
import { db } from '../db';
import { buyerProfiles, investmentStrategies } from '@shared/schema';
import { investmentChatService } from '../services/investment-chat-service';
import { investmentStrategyGenerator } from '../services/investment-strategy-mcp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

const router = Router();

/**
 * Investment chat endpoint
 * Processes natural language input and builds investor profile
 */
router.post('/api/investment-chat', async (req, res) => {
  try {
    const { message, context, sessionId } = req.body;
    
    // Process the message
    const response = await investmentChatService.processMessage(message, context);
    
    // If ready to analyze, trigger strategy generation
    if (response.type === 'ready_to_analyze' && response.strategyId && response.context) {
      const profile = investmentChatService.buildInvestorProfile(response.context);
      
      // Create or update buyer profile
      const [savedProfile] = await db.insert(buyerProfiles)
        .values({
          ...profile,
          name: profile.name || 'Investment Profile',
          email: profile.email || `investor-${Date.now()}@example.com`,
          budget: profile.budget || 'TBD',
          homeType: profile.homeType || 'other',
          bedrooms: profile.bedrooms || 1,
          bathrooms: profile.bathrooms || '1',
          createdAt: new Date().toISOString()
        } as any)
        .returning();
      
      // Create strategy record
      await db.insert(investmentStrategies)
        .values({
          profileId: savedProfile.id,
          sessionId: response.strategyId,
          status: 'generating',
          strategyJson: {},
          marketAnalysis: {},
          propertyRecommendations: [],
          financialProjections: {},
          generationTime: 0,
          dataSourcesUsed: [],
          createdAt: new Date().toISOString()
        });
      
      // Trigger async strategy generation
      console.log('🚀 Triggering strategy generation for profile:', savedProfile.id);
      investmentStrategyGenerator.generateStrategy(savedProfile, response.strategyId)
        .then(() => {
          console.log('✅ Strategy generation completed successfully');
        })
        .catch(error => {
          console.error('❌ Strategy generation failed:', error);
          console.error('Stack trace:', error.stack);
        });
    }
    
    res.json(response);
  } catch (error) {
    console.error('Investment chat error:', error);
    res.status(500).json({ 
      error: 'Failed to process chat message',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Check strategy status
 */
router.get('/api/investment-strategy/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get strategy from database
    const [strategy] = await db.select()
      .from(investmentStrategies)
      .where(eq(investmentStrategies.sessionId, sessionId))
      .limit(1);
    
    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }
    
    // If complete, include document content
    if (strategy.status === 'complete' && strategy.documentUrl) {
      try {
        const documentPath = path.join(process.cwd(), strategy.documentUrl);
        const documentContent = await fs.readFile(documentPath, 'utf-8');
        
        return res.json({
          status: strategy.status,
          strategy: strategy.strategyJson,
          document: documentContent,
          generationTime: strategy.generationTime,
          completedAt: strategy.completedAt
        });
      } catch (error) {
        console.error('Error reading strategy document:', error);
      }
    }
    
    // Return status only
    res.json({
      status: strategy.status,
      message: strategy.status === 'generating' 
        ? 'Your investment strategy is being generated. This typically takes 5-10 minutes.'
        : 'Strategy generation failed. Please try again.'
    });
    
  } catch (error) {
    console.error('Strategy status error:', error);
    res.status(500).json({ 
      error: 'Failed to get strategy status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Test endpoint - Create sample investment profile
 */
router.post('/api/investment-test', async (req, res) => {
  try {
    const { type = 'multi_unit', capital = 2000000, location = 'Worcester' } = req.body;
    
    // Create test profile
    const testProfile = {
      buyerType: 'investor' as const,
      investorType: type,
      investmentCapital: capital,
      location,
      name: 'Test Investor',
      email: 'test@investor.com',
      budget: `$${capital / 1000}K`,
      budgetMin: capital * 2,
      budgetMax: capital * 4,
      homeType: type === 'multi_unit' ? 'other' as const : 'single-family' as const,
      bedrooms: type === 'multi_unit' ? 8 : 3,
      bathrooms: type === 'multi_unit' ? '8+' : '2+',
      mustHaveFeatures: [],
      dealbreakers: [],
      preferredAreas: [location],
      lifestyleDrivers: [],
      specialNeeds: [],
      budgetFlexibility: 50,
      locationFlexibility: 50,
      timingFlexibility: 50,
      rawInput: 'Test profile',
      inputMethod: 'form' as const,
      createdAt: new Date().toISOString()
    };
    
    // Save profile
    const [savedProfile] = await db.insert(buyerProfiles)
      .values(testProfile)
      .returning();
    
    // Create strategy
    const strategyId = uuidv4();
    await db.insert(investmentStrategies)
      .values({
        profileId: savedProfile.id,
        sessionId: strategyId,
        status: 'generating',
        strategyJson: {},
        marketAnalysis: {},
        propertyRecommendations: [],
        financialProjections: {},
        generationTime: 0,
        dataSourcesUsed: [],
        createdAt: new Date().toISOString()
      });
    
    // Generate strategy
    investmentStrategyGenerator.generateStrategy(savedProfile, strategyId)
      .catch(error => {
        console.error('Test strategy generation failed:', error);
      });
    
    res.json({
      message: 'Test investment profile created',
      profileId: savedProfile.id,
      strategyId,
      checkStatusUrl: `/api/investment-strategy/${strategyId}`
    });
    
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ 
      error: 'Failed to create test profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Import for eq function
import { eq } from 'drizzle-orm';

export default router;
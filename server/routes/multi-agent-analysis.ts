/**
 * Multi-Agent Analysis Routes
 * Comprehensive real estate investment analysis with specialized agents
 */

import { Router } from 'express';
import { AgentOrchestrator, ComprehensiveAnalysisRequest } from '../agents/agent-orchestrator.js';

const router = Router();
const orchestrator = new AgentOrchestrator();

// Store analysis results temporarily (in production, use Redis or database)
const analysisCache = new Map();

/**
 * POST /api/multi-agent/analyze
 * Trigger comprehensive multi-agent real estate analysis
 */
router.post('/analyze', async (req, res) => {
  try {
    const { userInput, priorityLevel = 'comprehensive', includeAgentInsights = true } = req.body;

    if (!userInput) {
      return res.status(400).json({ error: 'User input is required' });
    }

    console.log(`🎯 [Multi-Agent API] Starting ${priorityLevel} analysis...`);

    // Prepare analysis request with real estate agent insights
    const request: ComprehensiveAnalysisRequest = {
      userInput,
      priorityLevel: priorityLevel as 'speed' | 'comprehensive' | 'detailed',
      agentInsights: includeAgentInsights ? AgentOrchestrator.getRealEstateAgentInsights() : undefined
    };

    // Execute comprehensive analysis
    const analysisResult = await orchestrator.executeComprehensiveAnalysis(request);

    // Cache the result
    analysisCache.set(analysisResult.strategyId, analysisResult);

    // Return streamlined response
    res.json({
      success: true,
      strategyId: analysisResult.strategyId,
      summary: {
        propertiesAnalyzed: analysisResult.enhancedProperties.length,
        marketsResearched: analysisResult.marketAnalyses.length,
        aduOpportunities: analysisResult.enhancedProperties.filter(p => 
          p.enhancementAnalysis.aduPotential.basementAduFeasible
        ).length,
        averageROE: analysisResult.enhancedProperties.length > 0 ? 
          analysisResult.enhancedProperties.reduce((sum, p) => 
            sum + p.financialAnalysis.recommendedScenario.returnOnEquity, 0
          ) / analysisResult.enhancedProperties.length : 0,
        totalEconomicBenefit: analysisResult.enhancedProperties.length > 0 ?
          analysisResult.enhancedProperties.reduce((sum, p) => 
            sum + p.financialAnalysis.recommendedScenario.totalEconomicBenefit, 0
          ) : 0
      },
      reportPath: analysisResult.reportFilePath,
      estimatedAnalysisTime: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Multi-Agent API] Analysis failed:', error);
    res.status(500).json({ 
      error: 'Analysis failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/multi-agent/analysis/:strategyId
 * Retrieve complete analysis results
 */
router.get('/analysis/:strategyId', async (req, res) => {
  try {
    const { strategyId } = req.params;
    const analysisResult = analysisCache.get(strategyId);

    if (!analysisResult) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    res.json({
      success: true,
      analysis: analysisResult
    });

  } catch (error) {
    console.error('[Multi-Agent API] Retrieval failed:', error);
    res.status(500).json({ error: 'Failed to retrieve analysis' });
  }
});

/**
 * GET /api/multi-agent/properties/:strategyId
 * Get enhanced property recommendations with ADU analysis
 */
router.get('/properties/:strategyId', async (req, res) => {
  try {
    const { strategyId } = req.params;
    const analysisResult = analysisCache.get(strategyId);

    if (!analysisResult) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    // Format properties for display
    const formattedProperties = analysisResult.enhancedProperties.map((property: any, index: number) => ({
      rank: index + 1,
      address: property.address,
      price: property.price,
      location: property.location,
      
      // Financial Analysis
      baseFinancials: {
        estimatedRent: property.financialAnalysis.baseAnalysis.estimatedRent,
        capRate: property.financialAnalysis.baseAnalysis.capRate,
        monthlyEconomicBenefit: property.financialAnalysis.recommendedScenario.totalEconomicBenefit,
        returnOnEquity: property.financialAnalysis.recommendedScenario.returnOnEquity
      },

      // ADU Potential
      aduAnalysis: {
        feasible: property.enhancementAnalysis.aduPotential.basementAduFeasible,
        estimatedCost: property.enhancementAnalysis.aduPotential.estimatedAduCost,
        monthlyRent: property.enhancementAnalysis.aduPotential.estimatedAduRent,
        roi: property.enhancementAnalysis.aduPotential.monthlyROI,
        paybackPeriod: property.enhancementAnalysis.aduPotential.paybackPeriod
      },

      // Value-Add Opportunities
      valueAdd: {
        opportunities: property.enhancementAnalysis.valueAddOpportunities.renovationPotential,
        totalCost: Object.values(property.enhancementAnalysis.valueAddOpportunities.estimatedCosts)
          .reduce((sum: number, cost: any) => sum + (cost || 0), 0),
        monthlyIncrease: Object.values(property.enhancementAnalysis.valueAddOpportunities.rentIncreaseOpportunities)
          .reduce((sum: number, increase: any) => sum + (increase || 0), 0)
      },

      // Strategic Factors
      strategic: {
        score: property.strategicScore,
        factors: property.proximityFactors
      },

      // Investment Scenarios
      scenarios: property.financialAnalysis.scenarios.map((scenario: any) => ({
        name: scenario.scenario,
        downPayment: scenario.downPayment,
        monthlyFlow: scenario.monthlyCashFlow,
        totalBenefit: scenario.totalEconomicBenefit,
        roe: scenario.returnOnEquity,
        walkthrough: scenario.walkthrough
      }))
    }));

    res.json({
      success: true,
      properties: formattedProperties,
      summary: {
        total: formattedProperties.length,
        withAduPotential: formattedProperties.filter(p => p.aduAnalysis.feasible).length,
        averageROE: formattedProperties.reduce((sum: number, p: any) => sum + p.baseFinancials.returnOnEquity, 0) / formattedProperties.length
      }
    });

  } catch (error) {
    console.error('[Multi-Agent API] Property retrieval failed:', error);
    res.status(500).json({ error: 'Failed to retrieve properties' });
  }
});

/**
 * GET /api/multi-agent/report/:strategyId
 * Get comprehensive investment report
 */
router.get('/report/:strategyId', async (req, res) => {
  try {
    const { strategyId } = req.params;
    const analysisResult = analysisCache.get(strategyId);

    if (!analysisResult) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    res.json({
      success: true,
      report: analysisResult.investmentReport,
      filePath: analysisResult.reportFilePath
    });

  } catch (error) {
    console.error('[Multi-Agent API] Report retrieval failed:', error);
    res.status(500).json({ error: 'Failed to retrieve report' });
  }
});

export default router;
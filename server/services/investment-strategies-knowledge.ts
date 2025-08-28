/**
 * Investment Strategies Knowledge Base
 * 
 * Phase 1: Static knowledge that LLM will enhance with discoveries
 * Future: This will evolve to include learned patterns and agent contributions
 */

export const INVESTMENT_KNOWLEDGE = {
  // Core investor types and their proven strategies
  investorTypes: {
    rental_income: {
      name: "Buy & Hold Rental",
      description: "Long-term rental income strategy",
      typicalCapital: { min: 50000, max: 500000 },
      targetMetrics: {
        minCapRate: 6,
        minCashFlow: 200, // per unit per month
        maxVacancyRate: 5
      },
      mustHaveFeatures: [
        "Stable neighborhood",
        "Good rental history",
        "Low maintenance requirements",
        "Near employment centers"
      ],
      dealbreakers: [
        "High crime area",
        "Major deferred maintenance",
        "Rent control restrictions"
      ],
      searchCriteria: {
        propertyTypes: ["single-family", "duplex", "triplex"],
        priceMultiplier: 4, // With 25% down
        keywords: ["rental", "investment", "income property"]
      }
    },
    
    multi_unit: {
      name: "Multi-Unit Investment",
      description: "8+ unit apartment buildings",
      typicalCapital: { min: 500000, max: 5000000 },
      targetMetrics: {
        minCapRate: 7,
        minCashFlow: 15000, // total per month
        minUnits: 8
      },
      mustHaveFeatures: [
        "Professional management possible",
        "Stable tenant base",
        "Separate utilities",
        "Good unit mix"
      ],
      dealbreakers: [
        "Deferred maintenance over $100K",
        "Vacancy over 20%",
        "Single boiler system"
      ],
      searchCriteria: {
        propertyTypes: ["multi-family"],
        minBedrooms: 8, // Proxy for units
        keywords: ["units", "apartment building", "income"]
      }
    },
    
    flip: {
      name: "Fix & Flip",
      description: "Buy, renovate, sell for profit",
      typicalCapital: { min: 100000, max: 1000000 },
      targetMetrics: {
        minProfit: 50000,
        maxHoldTime: 6, // months
        targetROI: 20 // percent
      },
      mustHaveFeatures: [
        "Desirable neighborhood",
        "Cosmetic updates needed",
        "Below market price",
        "Good resale potential"
      ],
      dealbreakers: [
        "Structural damage",
        "Foundation issues",
        "Declining neighborhood"
      ],
      searchCriteria: {
        propertyTypes: ["single-family"],
        keywords: ["fixer", "handyman", "as-is", "estate sale"],
        daysOnMarket: { min: 30 }
      }
    },
    
    house_hack: {
      name: "House Hacking",
      description: "Live in one unit, rent others",
      typicalCapital: { min: 20000, max: 150000 },
      targetMetrics: {
        minRentCoverage: 75, // % of mortgage
        maxUnits: 4, // FHA limit
        ownerOccupancyRequired: true
      },
      mustHaveFeatures: [
        "Separate entrances",
        "2-4 units",
        "FHA eligible",
        "Privacy between units"
      ],
      dealbreakers: [
        "HOA rental restrictions",
        "Single unit only",
        "Major repairs needed"
      ],
      searchCriteria: {
        propertyTypes: ["duplex", "triplex", "fourplex"],
        keywords: ["owner occupied", "multi-family"],
        priceMultiplier: 20 // With 5% down
      }
    }
  },
  
  // Questions to ask in chat
  questionFlow: {
    initial: "I'll help you create a comprehensive investment strategy. What type of real estate investment interests you most? (rental income, fix & flip, house hacking, or multi-unit properties)",
    
    capital: "How much capital do you have available for investment? This helps determine your purchasing power with leverage.",
    
    location: "What locations are you considering for your investment property?",
    
    goals: "What's your primary investment goal - monthly cash flow, long-term appreciation, or quick profits?",
    
    targetMonthlyReturn: "What monthly cash flow target are you aiming for? This helps me find properties that meet your income goals.",
    
    experience: "Have you invested in real estate before, or is this your first investment property?"
  },
  
  // Base prompts for LLM enhancement
  llmEnhancementPrompts: {
    marketAnalysis: `
      Beyond standard metrics, analyze:
      1. Emerging neighborhood trends
      2. Infrastructure developments
      3. Demographic shifts
      4. Economic indicators
      5. Hidden opportunities
    `,
    
    propertySpecific: `
      Look for non-obvious value indicators:
      1. Zoning change potential
      2. Development possibilities
      3. Below-market rent opportunities
      4. Value-add renovations
      5. Unique market positioning
    `,
    
    riskAssessment: `
      Identify risks beyond standard concerns:
      1. Market-specific regulations
      2. Climate/environmental factors
      3. Economic dependencies
      4. Future competition
      5. Exit strategy challenges
    `
  }
};

// Helper functions
export function getInvestorTypeConfig(type: string) {
  return INVESTMENT_KNOWLEDGE.investorTypes[type as keyof typeof INVESTMENT_KNOWLEDGE.investorTypes];
}

export function getQuestionForField(field: string): string {
  return INVESTMENT_KNOWLEDGE.questionFlow[field as keyof typeof INVESTMENT_KNOWLEDGE.questionFlow] || 
         `Could you provide more details about ${field}?`;
}

export function getSearchCriteria(investorType: string, capital: number) {
  const config = getInvestorTypeConfig(investorType);
  if (!config) return null;
  
  const criteria = { ...config.searchCriteria };
  
  // Calculate price range based on capital and leverage  
  const multiplier = (criteria as any).priceMultiplier || 4;
  (criteria as any).maxPrice = capital * multiplier;
  (criteria as any).minPrice = capital * multiplier * 0.5; // Allow for range
  
  return criteria;
}

// For future: function to add discovered insights
export function addDiscoveredInsight(investorType: string, insight: any) {
  // Phase 2: This will save to database
  console.log(`New insight discovered for ${investorType}:`, insight);
  // TODO: Implement persistence and pattern tracking
}

export type InvestorType = keyof typeof INVESTMENT_KNOWLEDGE.investorTypes;
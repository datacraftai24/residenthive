# AI Investment Advisor - Research-Driven Architecture Reconnection Plan

## Current Situation
✅ **Completed**: Deleted 4 unnecessary agents (MarketScout, PropertyGenius, PropertyScoring, AIOrchestra)
🔴 **Problem**: System still uses hardcoded values and doesn't research actual market data
🎯 **Goal**: Reconnect the research-driven architecture you built and tested with Tavily MCP

## The Original Philosophy
**"Why are we using rules when we have LLMs?"** - Every number must come from research, not hardcoded values.

## Phase 1: Wire Research Pipeline (30 mins)

### Step 1.1: Import Research Agents
**File**: `/server/services/ai-investment-advisor.ts`
```typescript
// Add imports
import { researchCoordinator } from '../ai-agents/research-coordinator.js';
import { smartResearchAgent } from '../ai-agents/smart-research-agent.js';
import { strategyBuilderMCP } from '../ai-agents/strategy-builder-mcp.js';
```

### Step 1.2: Add Research Phase BEFORE Property Search
**Location**: In `analyze()` method, before "Step 2: Developing investment strategies"
```typescript
// NEW STEP 1.5: Research Phase
console.log('\n🔬 Step 1.5: Researching market data...');
const researchNeeds = await researchCoordinator.identifyResearchNeeds(
  {
    id: sessionId,
    availableCash: requirements.budget.cashAvailable,
    monthlyIncomeTarget: requirements.budget.monthlyTarget,
    location: requirements.locations[0] || 'Quincy, MA',
    creditScore: requirements.creditScore,
    timeline: requirements.timeline
  },
  ['traditional', 'adu', 'house_hack', 'midterm', 'section8']
);

// Execute research queries
const marketResearch = [];
for (const query of researchNeeds.researchQueries.slice(0, 15)) {
  const result = await smartResearchAgent.doResearch(query.query, query.category);
  marketResearch.push(result);
}
console.log(`✅ Completed ${marketResearch.length} research queries`);
```

## Phase 2: Replace Strategy Generation (20 mins)

### Step 2.1: Replace StrategyMind with StrategyBuilderMCP
**File**: `/server/services/ai-investment-advisor.ts`

**Remove**:
```typescript
private strategyMind: StrategyMindAgent;
this.strategyMind = new StrategyMindAgent(this.factStore);
```

**Add**:
```typescript
private strategyBuilder: typeof strategyBuilderMCP;
this.strategyBuilder = strategyBuilderMCP;
```

### Step 2.2: Update developStrategies Method
**Replace entire `developStrategies()` method**:
```typescript
private async developStrategies(
  requirements: UserRequirements,
  marketResearch: ResearchResult[], // NEW PARAMETER
  ctx: SpanContext
): Promise<any> {
  
  const clientProfile = {
    availableCash: requirements.budget.cashAvailable,
    monthlyIncomeTarget: requirements.budget.monthlyTarget,
    location: requirements.locations[0] || 'Quincy, MA',
    creditScore: requirements.creditScore || 720
  };
  
  // Use StrategyBuilderMCP with research data
  const strategies = await this.strategyBuilder.generateStrategiesWithMCP(
    clientProfile,
    marketResearch
  );
  
  return {
    conservative: strategies[0],
    innovative: strategies[1], 
    aggressive: strategies[2],
    all: strategies
  };
}
```

## Phase 3: Update Financial Calculator (15 mins)

### Step 3.1: Pass Research Data to Financial Calculator
**File**: `/server/agents/financial-calculator-smart.ts`

**Update calculate method to accept research data**:
```typescript
async calculate(
  property: any,
  strategy: any,
  marketResearch?: ResearchResult[] // NEW PARAMETER
): Promise<FinancialAnalysis> {
  
  // Extract researched rates
  const taxRate = this.extractFromResearch(marketResearch, 'property_tax') || 0.01153;
  const insuranceRate = this.extractFromResearch(marketResearch, 'insurance') || 200;
  const mortgageRate = this.extractFromResearch(marketResearch, 'mortgage_rate') || 0.0725;
  
  // Use researched values instead of hardcoded
  const monthlyTax = (property.listPrice * taxRate) / 12;
  const monthlyInsurance = insuranceRate;
  // ... rest of calculation
}
```

## Phase 4: Update Strategy Evaluator (15 mins)

### Step 4.1: Use Research Data for Expense Calculations
**File**: `/server/services/strategy-evaluator.ts`

**Update evaluateStrategy to use research**:
```typescript
async evaluateStrategy(
  property: any,
  strategyType: string,
  marketResearch?: ResearchResult[] // NEW PARAMETER
): Promise<any> {
  
  // Get researched rental rates
  const rentComps = this.extractFromResearch(marketResearch, 'rent_rates');
  
  // Use actual comps instead of guessing
  const monthlyRent = rentComps?.[property.bedrooms + 'BR'] || 
                      this.estimateRent(property); // fallback
  
  // Get researched expense ratios
  const maintenanceRatio = this.extractFromResearch(marketResearch, 'maintenance') || 0.10;
  const vacancyRate = this.extractFromResearch(marketResearch, 'vacancy') || 0.05;
  
  // Calculate with researched data
  const monthlyMaintenance = monthlyRent * maintenanceRatio;
  const vacancyLoss = monthlyRent * vacancyRate;
}
```

## Phase 5: Testing & Validation (30 mins)

### Step 5.1: Test with Sarah from MA
```bash
curl -X POST http://localhost:3000/api/ai-investment-advisor \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Sarah from Massachusetts has $250,000 cash and wants $2,500/month passive income",
    "preferences": {
      "depth": "comprehensive"
    }
  }'
```

### Step 5.2: Validate Research is Being Used
**Check logs for**:
- "🔬 Step 1.5: Researching market data..."
- "✅ Completed X research queries"
- Actual rental comps being used
- Real mortgage rates from research
- Property tax rates from assessor data

### Step 5.3: Verify Report Shows
- Positive cash flow properties (if they exist)
- Realistic expenses based on research
- Sources cited for all numbers
- No 999 month break-even periods
- Baseline rental scenarios

## Phase 6: Clean Up (10 mins)

### Step 6.1: Remove Hardcoded Values
**Search and remove**:
- Fixed expense ratios (10%, 5%, etc.)
- Hardcoded mortgage rates (7.5%)
- Fixed insurance amounts ($200)
- Arbitrary property tax rates (1.2%)

### Step 6.2: Add Research Caching
```typescript
// Cache research results for 24 hours
const cacheKey = `research_${location}_${Date.now() / 86400000}`;
const cached = await cache.get(cacheKey);
if (cached) return cached;
```

## Expected Outcomes

### Before (Current Problems)
- ❌ All properties show negative cash flow
- ❌ Expenses are hardcoded percentages
- ❌ No rental comps used
- ❌ Meaningless metrics (999 months)
- ❌ No market research

### After (With Research Pipeline)
- ✅ Properties filtered by actual cash flow potential
- ✅ Expenses based on researched data
- ✅ Rental rates from market comps
- ✅ Realistic financial projections
- ✅ All numbers have sources

## Implementation Order

1. **First**: Wire Research Coordinator + Smart Research Agent (Phase 1)
2. **Second**: Replace StrategyMind with StrategyBuilderMCP (Phase 2)
3. **Third**: Update Financial Calculator (Phase 3)
4. **Fourth**: Update Strategy Evaluator (Phase 4)
5. **Fifth**: Test with Sarah scenario (Phase 5)
6. **Last**: Clean up hardcoded values (Phase 6)

## Success Criteria

The system is successfully reconnected when:
1. Research phase runs BEFORE strategy generation
2. All strategies use researched market data
3. Financial calculations use real rates/expenses
4. Reports show properties with positive cash flow (if they exist)
5. Every number in the report has a source

## Time Estimate
- Total: 2 hours
- Phase 1: 30 minutes
- Phase 2: 20 minutes
- Phase 3: 15 minutes
- Phase 4: 15 minutes
- Phase 5: 30 minutes
- Phase 6: 10 minutes

## Risk Mitigation
- Keep original files backed up
- Test each phase independently
- Log all research queries and results
- Implement fallbacks for research failures
- Cache research to avoid rate limits
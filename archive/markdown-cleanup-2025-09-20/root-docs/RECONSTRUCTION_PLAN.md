# Agent Reconstruction Plan

## Current System Flow

```
1. Research Coordinator → Smart Research Agent → Research Results
2. Strategy Builder V3 → Generates strategies with buy_box and search_space
3. Strategic Property Hunter V2 → Searches using strategy.buy_box parameters
4. Property Evaluator Comprehensive → Two-phase evaluation (if COMPREHENSIVE)
5. Property Evaluator Clean → Final investment decision (evaluateAndDecide)
6. Report Generator Clean → Final report
```

## Missing Files to Recreate

### 1. `property-hunter-strategic-v2.ts`
**Purpose**: Bridge between strategy and property search
**Key Interface**:
```typescript
interface StrategySearchInput {
  name: string;
  searchCriteria: {
    propertyTypes?: string[];
    maxPrice?: number;
    minPrice?: number;
    locations?: string[];
    minBedrooms?: number;
    minBathrooms?: number;
    mustGenerate?: number;
  }
}
```
**Implementation Notes**:
- Must handle strategy.buy_box parameters
- Must do comprehensive search (no limits)
- Must convert strategy format to PropertyHunter format

### 2. `property-evaluator-clean.ts`
**Purpose**: Final investment decision maker
**Key Method**: `evaluateAndDecide(properties, strategies, research, requirements)`
**Returns**: Investment decision with:
- winningStrategy
- topProperties
- metrics.totalPropertiesEvaluated

### 3. Fix `property-evaluator-llm` reference
**Issue**: Line 440 references propertyEvaluatorLLM but it's not imported
**Solution**: Either remove this code path or use propertyEvaluatorComprehensive

## Strategy → Property Search Mapping

From strategy.buy_box:
- `property_types` → searchCriteria.propertyTypes
- `price_band_usd.max` → searchCriteria.maxPrice
- `price_band_usd.min` → searchCriteria.minPrice
- `submarkets` → searchCriteria.locations (or fallback to profile.location)
- `beds_baths_min.beds` → searchCriteria.minBedrooms
- `beds_baths_min.baths` → searchCriteria.minBathrooms
- `evaluation_rules.min_monthly_cashflow_usd` → searchCriteria.mustGenerate

## Implementation Order

1. Create `property-hunter-strategic-v2.ts` with proper strategy handling
2. Create `property-evaluator-clean.ts` with evaluateAndDecide method
3. Fix propertyEvaluatorLLM reference (remove or redirect)
4. Test the complete flow
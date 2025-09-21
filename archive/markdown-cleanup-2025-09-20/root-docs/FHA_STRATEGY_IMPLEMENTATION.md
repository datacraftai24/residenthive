# FHA Strategy Implementation - Config-Driven Architecture

## Executive Summary
FHA is evaluated as an **investment strategy**, not a personal qualification test. Our agents analyze FHA as one of multiple paths to achieve investor goals, focusing on leverage advantages, self-sufficiency requirements, and cash-on-cash returns.

## Core Philosophy
**"Why use rules when we have LLMs?"** - Agents determine FHA viability through intelligent analysis, not hardcoded formulas.

---

## 1. Strategic FHA Evaluation Framework

### What We're Building
```
FHA as Strategy Evaluator
├── Market-Level Analysis (Does FHA work here?)
├── Property-Level Analysis (Self-sufficiency test)
├── Return Comparison (FHA vs Conventional vs DSCR)
└── Exit Strategy Planning (Refinance timeline)
```

### What We're NOT Building
- ❌ Personal DTI calculators
- ❌ Individual credit checks  
- ❌ Loan approval simulators
- ❌ Hardcoded qualification rules

---

## 2. Agent Enhancements

### MarketDiscoveryAgent - FHA Strategy Layer

#### New Output Structure
```typescript
interface MarketCandidate {
  city: string;
  state: string;
  metrics: {
    median_price: number;
    median_rent: number;
    // NEW: FHA Strategic Data
    fha_strategy: {
      limits: {
        oneUnit: number;
        twoUnit: number;
        threeUnit: number;
        fourUnit: number;
      };
      viability: {
        oneUnit: boolean;
        twoUnit: boolean;
        threeUnit: boolean;
        fourUnit: boolean;
      };
      leverage_advantage: string; // "3.5% down saves $X vs conventional"
      mip_impact: number; // Monthly cost
    };
  };
  // NEW: Strategic Recommendations
  recommended_strategies: Array<{
    type: 'FHA' | 'Conventional' | 'DSCR' | 'Cash';
    reasoning: string;
    cash_on_cash: number;
    entry_cost: number;
  }>;
}
```

#### Implementation Tasks
1. Pull FHA limits from ConfigRegistry
2. Calculate viability for each unit type
3. Compare leverage advantages
4. Generate strategic recommendations

### DataReconciliationAgent - Self-Sufficiency Validation

#### New Validation Method
```typescript
interface FHASelfSufficiencyTest {
  property_type: '3-unit' | '4-unit';
  rental_income: number;        // From reconciled data
  required_coverage: number;     // 75% of PITIA
  pitia_components: {
    principal_interest: number;
    tax: number;
    insurance: number;
    mip: number;                // FHA-specific
    hoa?: number;
  };
  test_result: {
    passes: boolean;
    margin: number;             // Buffer above/below requirement
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}
```

#### Implementation Tasks
1. Calculate PITIA with MIP for 3-4 units
2. Apply 75% rule from ConfigRegistry
3. Validate against reconciled rent data
4. Flag risk levels based on margin

---

## 3. ConfigRegistry Schema Updates

### New Config Keys

```json
{
  "fha-strategy-rules": {
    "self_sufficiency": {
      "applies_to": [3, 4],
      "min_rent_coverage": 0.75,
      "description": "Property rent must cover 75% of PITIA for 3-4 units"
    },
    "mip_rates": {
      "upfront": 0.0175,
      "annual": 0.0085,
      "cancellation": "At 20% equity or refinance"
    },
    "down_payment": {
      "owner_occupied": 0.035,
      "investment": null  // FHA requires owner-occupancy
    },
    "refinance_strategy": {
      "typical_timeline": "24-36 months",
      "trigger": "20% equity to remove MIP"
    }
  },
  
  "strategy-comparison-weights": {
    "cash_on_cash_return": 0.4,
    "entry_capital_required": 0.3,
    "monthly_cash_flow": 0.2,
    "flexibility": 0.1
  }
}
```

### County-Specific FHA Limits (Already in ConfigRegistry)
```json
{
  "county-mapping": {
    "Worcester": {
      "county": "Worcester",
      "fha": {
        "oneUnit": 523000,
        "twoUnit": 669650,
        "threeUnit": 809150,
        "fourUnit": 1006300
      }
    }
  }
}
```

---

## 4. Implementation Steps

### Phase 1: Config Setup (Day 1)
- [ ] Add fha-strategy-rules to seed configs
- [ ] Update ConfigRegistry schema
- [ ] Add strategy comparison weights
- [ ] Test config loading

### Phase 2: MarketDiscoveryAgent Enhancement (Day 2)
- [ ] Add FHA limit fetching from ConfigRegistry
- [ ] Implement viability calculation
- [ ] Add leverage advantage computation
- [ ] Generate strategy recommendations

### Phase 3: DataReconciliationAgent Enhancement (Day 3)
- [ ] Add self-sufficiency test method
- [ ] Integrate MIP calculations
- [ ] Add risk level assessment
- [ ] Cross-validate with market rents

### Phase 4: Integration Testing (Day 4)
- [ ] Test Worcester 4-unit scenario
- [ ] Test Springfield 2-unit scenario
- [ ] Test edge cases (price at limit)
- [ ] Verify no hardcoding

---

## 5. Example Outputs

### Scenario: Worcester 3-Unit Property

#### MarketDiscoveryAgent Output
```json
{
  "city": "Worcester",
  "fha_strategy": {
    "viable": true,
    "property_price": 625000,
    "fha_limit": 809150,
    "down_payment_fha": 21875,
    "down_payment_conventional": 125000,
    "cash_saved": 103125,
    "leverage_advantage": "FHA enables entry with 82% less capital"
  }
}
```

#### DataReconciliationAgent Output  
```json
{
  "self_sufficiency_test": {
    "rental_income": 3500,
    "required_coverage": 3200,
    "passes": true,
    "margin": 300,
    "risk_level": "LOW",
    "assessment": "Property comfortably passes FHA self-sufficiency"
  }
}
```

#### Strategic Recommendation
```json
{
  "recommended_strategy": "FHA",
  "reasoning": [
    "Minimal entry cost ($21,875 vs $125,000)",
    "Cash-on-cash return: 12.8% (FHA) vs 4.2% (conventional)",
    "Property passes self-sufficiency test with $300 buffer",
    "Exit strategy: Refinance in 24-36 months to remove MIP"
  ],
  "risks": [
    "MIP adds $285/month to expenses",
    "Must owner-occupy for first year",
    "Limited to one FHA loan at a time"
  ]
}
```

---

## 6. Testing Scenarios

### Test Case 1: FHA Viable
- Property: Worcester 3-unit at $625K
- Rent: $3,500/month
- Expected: FHA recommended, passes self-sufficiency

### Test Case 2: FHA Not Viable (Price)
- Property: Boston 4-unit at $1.2M
- FHA Limit: $1.06M
- Expected: Conventional or DSCR recommended

### Test Case 3: FHA Fails Self-Sufficiency
- Property: Springfield 4-unit
- Rent: $2,800/month
- Required: $3,200/month (75% of PITIA)
- Expected: FHA not recommended despite price viability

---

## 7. Success Metrics

1. **No Hardcoding**: All limits and rates from ConfigRegistry
2. **Strategic Focus**: FHA evaluated as investment tool, not qualification
3. **Dynamic Learning**: Agents adjust recommendations based on market performance
4. **Transparent Logic**: Clear reasoning for FHA vs alternatives

---

## 8. Next Steps

1. **Immediate**: Implement Phase 1 (Config Setup)
2. **Tomorrow**: Start Phase 2 (MarketDiscoveryAgent)
3. **This Week**: Complete all phases
4. **Next Week**: Integration with main investment strategy flow

---

## 9. Code Examples

### MarketDiscoveryAgent - FHA Evaluation
```typescript
private async evaluateFHAStrategy(
  market: MarketCandidate,
  investorProfile: InvestorProfile
): Promise<FHAStrategyAssessment> {
  // Get FHA limits from config
  const countyData = await configRegistry.getValue('county-mapping');
  const fhaRules = await configRegistry.getValue('fha-strategy-rules');
  
  const limits = countyData[market.city]?.fha || {};
  
  // Use LLM to evaluate strategic fit
  const assessment = await this.llm.evaluate({
    market,
    limits,
    investorGoals: investorProfile,
    rules: fhaRules
  });
  
  return {
    viable: market.metrics.median_price < limits.threeUnit,
    advantage: this.calculateLeverageAdvantage(market, limits),
    recommendation: assessment.recommendation
  };
}
```

### DataReconciliationAgent - Self-Sufficiency
```typescript
private async validateSelfSufficiency(
  propertyType: string,
  monthlyRent: number,
  propertyPrice: number
): Promise<SelfSufficiencyResult> {
  const fhaRules = await configRegistry.getValue('fha-strategy-rules');
  
  // Calculate PITIA components
  const pitia = await this.calculatePITIA(propertyPrice, true); // true = include MIP
  
  const requiredCoverage = pitia * fhaRules.self_sufficiency.min_rent_coverage;
  
  return {
    passes: monthlyRent >= requiredCoverage,
    margin: monthlyRent - requiredCoverage,
    riskLevel: this.assessRiskLevel(monthlyRent, requiredCoverage)
  };
}
```

---

*Created: 2025-01-03*  
*Version: 1.0 - FHA Strategic Analysis Implementation*
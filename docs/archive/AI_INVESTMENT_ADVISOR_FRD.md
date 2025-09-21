# AI Investment Advisor - Functional Requirements Document

## System Overview

The AI Investment Advisor is a comprehensive real estate investment analysis system that uses researched market data to evaluate properties against multiple investment strategies, providing actionable recommendations for investors.

## Core Architecture

```
CLIENT INPUT → RESEARCH → STRATEGY GENERATION → DUAL SEARCH → EVALUATION → RANKING → REPORT
```

## Phase 1: Research Foundation

### Research Coordinator Agent
**Purpose**: Identify and prioritize market research needs

**Inputs**:
- Client profile (cash, goals, location, timeline)
- Investment strategies to consider

**Outputs**:
```javascript
{
  researchQueries: [
    {
      category: "RENT_RATES",
      query: "Quincy MA 2BR average rent 2025",
      priority: "HIGH",
      requiredFor: ["traditional", "section8", "midterm"]
    },
    {
      category: "PROPERTY_TAX",
      query: "Quincy MA property tax rate residential",
      priority: "HIGH",
      requiredFor: ["all"]
    }
  ]
}
```

**Key Requirements**:
- NO hardcoded values
- Must identify 8-15 research queries
- Prioritize by impact on calculations
- Consider all potential strategies

### Market Research Service
**Purpose**: Execute research via Tavily API

**Process**:
1. Take prioritized queries from Research Coordinator
2. Execute via Tavily API
3. Cache results with timestamps
4. Return structured facts

**Output Format**:
```javascript
{
  marketData: {
    rentRates: {
      "1BR": 2100,
      "2BR": 2750,
      "3BR": 3350,
      source: "Tavily - Apartments.com Aug 2025",
      confidence: "HIGH"
    },
    propertyTax: {
      rate: 0.01153,
      source: "Quincy Assessor FY2025",
      confidence: "HIGH"
    }
  }
}
```

## Phase 2: Strategy Generation

### Strategy Builder Agent
**Purpose**: Generate multiple investment strategies using researched data

**Key Changes**:
- Uses ONLY researched market data
- Outputs search criteria, NOT specific properties
- Generates 5-10 strategies per client

**Output Format**:
```javascript
{
  strategies: [
    {
      name: "traditional_rental",
      searchCriteria: {
        propertyTypes: ["2-4 units"],
        maxPrice: 850000, // Calculated from client cash
        locations: ["Quincy", "Braintree"],
        mustGenerate: 500 // Monthly cash flow minimum
      },
      evaluationCriteria: {
        minCapRate: 0.06,
        maxVacancy: 0.05,
        minCashFlow: 500
      }
    }
  ]
}
```

## Phase 3: Dual Search System

### Property Hunter Strategic
**Purpose**: Search MLS using BOTH NLP and parametric methods

**Dual Search Strategy**:
1. **NLP Search**: Natural language queries for flexibility
2. **Parametric Search**: Structured queries for precision
3. **Comparison**: Document discrepancies
4. **Merge**: Deduplicate and combine results

**Search Translation**:
```javascript
// Strategy criteria → NLP query
"investment properties in Quincy MA around $850000"

// Strategy criteria → Parametric query
{
  city: "Quincy",
  propertyType: ["Multi-Family"],
  maxPrice: 850000,
  minBeds: 2,
  status: "Active"
}
```

**Feedback Tracking**:
- Properties found by each method
- Properties missed by NLP
- Issues to report to Repliers

## Phase 4: Property Evaluation

### Financial Calculator Smart
**Purpose**: Calculate returns for ALL strategies per property

**Requirements**:
- NO hardcoded values
- Use researched market data
- Document every assumption
- Calculate 5-6 strategies per property

**Calculation Format**:
```javascript
{
  property: "123 Main St",
  strategies: {
    traditional: {
      monthlyIncome: 5500,
      monthlyExpenses: {
        mortgage: 3609, // 7.25% from research
        tax: 679,       // 1.153% from research
        insurance: 200, // From research
        management: 495, // 9% of rent
        maintenance: 275, // 5% of rent
        vacancy: 275     // 5% from research
      },
      netCashFlow: 1967,
      assumptions: {
        mortgageRate: {value: 0.0725, source: "market_research"},
        taxRate: {value: 0.01153, source: "quincy_assessor"}
      }
    },
    section8: { /* similar */ },
    midterm: { /* similar */ }
  }
}
```

### Strategy Evaluator
**Purpose**: Score each strategy with transparent criteria

**Scoring Criteria**:
```javascript
{
  cashFlowCriteria: {
    requirement: "$500/month minimum",
    actual: "$1,967/month",
    score: "PASS",
    margin: "+$1,467"
  },
  returnCriteria: {
    requirement: ">8% cash-on-cash",
    actual: "12.5%",
    score: "PASS"
  },
  riskCriteria: {
    vacancyRisk: "LOW",
    maintenanceRisk: "MEDIUM",
    overall: "ACCEPTABLE"
  }
}
```

## Phase 5: Ranking & Recommendations

### Intelligent Ranker
**Purpose**: Select best strategy per property and rank all properties

**Ranking Logic**:
1. For each property, identify best strategy
2. Rank by: Meets goals → Highest return → Lowest risk
3. Consider portfolio diversification
4. Output top 20 properties

## Phase 6: Report Generation

### Report Format
```javascript
{
  summary: {
    propertiesAnalyzed: 87,
    propertiesMeetingGoals: 12,
    topRecommendation: "456 Oak St"
  },
  
  recommendations: [
    {
      rank: 1,
      property: "456 Oak St",
      bestStrategy: "midterm_furnished",
      monthyCashFlow: 2100,
      reasoning: "Near hospital, 35% furnished premium",
      alternatives: [
        {strategy: "traditional", cashFlow: 1200},
        {strategy: "section8", cashFlow: 1850}
      ],
      nextSteps: [
        "Schedule viewing",
        "Verify MTR regulations",
        "Get furnishing quotes"
      ]
    }
  ],
  
  marketDataUsed: {
    "2BR Rent": "$2,750 (Source: Apartments.com)",
    "Tax Rate": "1.153% (Source: Quincy Assessor)",
    "Mortgage Rate": "7.25% (Source: Bankrate)"
  }
}
```

## Database Schema Requirements

### LLM Decision Logging
```sql
CREATE TABLE llm_decisions_enhanced (
  id SERIAL PRIMARY KEY,
  session_id TEXT,
  agent_name TEXT,
  decision_type TEXT,
  input_data JSONB,
  market_data_used JSONB,
  assumptions_made JSONB,
  output_generated JSONB,
  confidence_scores JSONB,
  processing_time_ms INTEGER,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

### Repliers Feedback Tracking
```sql
CREATE TABLE repliers_feedback (
  id SERIAL PRIMARY KEY,
  nlp_query TEXT,
  parametric_query JSONB,
  nlp_result_count INTEGER,
  parametric_result_count INTEGER,
  properties_missed_by_nlp JSONB,
  issue_type TEXT,
  severity TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

### Research Cache
```sql
CREATE TABLE market_research_cache (
  id SERIAL PRIMARY KEY,
  location TEXT,
  data_type TEXT,
  value JSONB,
  source TEXT,
  confidence TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Success Metrics

### Accuracy Metrics
- Properties meeting goals: >10% of searched
- Calculation accuracy: Within 5% of actual
- Strategy success rate: >70% user agreement

### Performance Metrics
- End-to-end processing: <2 minutes
- Properties evaluated: 50-100 per session
- Parallel processing: >10 properties/second

### Quality Metrics
- Data completeness: >90%
- Source documentation: 100%
- User action rate: >60% follow recommendations

## Implementation Priority

1. **Week 1**: Research Coordinator + Market Research Service
2. **Week 2**: Dual Search System + Feedback Tracking
3. **Week 3**: Financial Calculator (with researched data)
4. **Week 4**: Strategy Evaluator + Ranking
5. **Week 5**: Integration + Report Generation

## Key Principles

1. **NO HARDCODING**: All values from research
2. **DUAL SEARCH**: Both NLP and parametric
3. **MULTI-STRATEGY**: Evaluate all strategies per property
4. **TRANSPARENCY**: Document every assumption
5. **FEEDBACK**: Track and report API issues

## Agent Communication Flow

```
Research Coordinator → Market Research Service
                    ↓
              Strategy Builder
                    ↓
           Property Hunter (Dual)
                    ↓
           Financial Calculator
                    ↓
           Strategy Evaluator
                    ↓
           Intelligent Ranker
                    ↓
           Report Generator
```

## Critical Requirements

1. Every number must have a source
2. Research phase completes before search
3. All strategies evaluated per property
4. Transparent scoring with criteria
5. Actionable recommendations with next steps
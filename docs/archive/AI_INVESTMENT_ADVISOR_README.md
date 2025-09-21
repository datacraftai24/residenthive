# AI Investment Advisor System

## Overview
Professional AI-powered real estate investment advisor that analyzes properties and generates comprehensive investment strategies.

## Key Features
- **Expert Real Estate Analysis**: All AI agents positioned as experienced professionals with 20+ years expertise
- **Professional Investment Strategies**: Focus on proven approaches (ADUs, short-term rentals, value-add renovations)
- **Complete Financial Analysis**: Accurate expense calculations including mortgage, taxes, insurance, maintenance
- **Self-Healing Processing**: Resilient batch processing with timeouts and error recovery
- **Market Intelligence**: Deep analysis of Massachusetts markets with MLS data integration

## System Components

### 1. AI Investment Advisor (`server/services/ai-investment-advisor.ts`)
Main orchestrator that coordinates all agents and generates investment recommendations.

### 2. Strategy Mind Agent (`server/ai-agents/strategy-mind-agent.ts`)
Expert investment strategist that creates professional, data-driven strategies.
- NO co-living/co-working strategies
- Focus on ADUs, short-term rentals, BRRRR
- Complete financial projections

### 3. Market Scout Agent (`server/ai-agents/market-scout-agent.ts`)
Senior market analyst specializing in Massachusetts investment opportunities.

### 4. Financial Calculator (`server/agents/financial-calculator.ts`)
Comprehensive financial modeling with all expense components.

### 5. Property Hunter (`server/agents/property-hunter.ts`)
MLS integration for finding investment properties.

## API Endpoint

```javascript
POST /api/ai-investment-advisor

// Request body
{
  "query": "Natural language investment query",
  "preferences": {
    "depth": "standard" | "comprehensive",
    "riskTolerance": "low" | "medium" | "high",
    "timeHorizon": 5,
    "locations": ["Quincy, MA", "Braintree, MA"]
  }
}
```

## Performance Expectations
- **Standard Analysis**: 3-5 minutes
- **Comprehensive Analysis**: 10-20 minutes
- Processes properties in batches with timeout protection
- Automatically generates markdown reports

## Financial Calculations Include
- Mortgage principal & interest
- Property taxes (~1.2% annually)
- Insurance ($150-250/month)
- Maintenance (10% of rent)
- Vacancy (5-8% of rent)
- Property management (8-10% if applicable)
- HOA fees (if applicable)

## Investment Strategies
1. **Traditional Buy & Hold** - Long-term rental income
2. **House Hacking** - Owner-occupied with rental income
3. **ADU Development** - Adding accessory dwelling units
4. **Short-Term Rentals** - Airbnb/VRBO optimization
5. **BRRRR** - Buy, Rehab, Rent, Refinance, Repeat
6. **Value-Add Renovations** - Strategic improvements for higher rents
7. **Mixed-Use Conversions** - Commercial/residential combinations

## Reports
Generated reports saved to: `/reports/investment-analyses/`

Format: Comprehensive markdown with:
- Executive summary
- Market analysis
- Property recommendations
- Financial projections
- Risk assessments
- Implementation steps
- AI confidence scores

## Testing
```bash
# Build the system
npm run build

# Run development server
npm run dev

# Test via API
curl -X POST http://localhost:3000/api/ai-investment-advisor \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I have $250,000 and want to invest in Quincy MA",
    "preferences": {
      "depth": "standard",
      "riskTolerance": "medium",
      "timeHorizon": 5
    }
  }'
```

## Recent Improvements (Aug 2024)
- ✅ Eliminated amateur strategies (co-living/co-working)
- ✅ Fixed $0 expense calculations
- ✅ Added expert real estate agent positioning
- ✅ Implemented self-healing batch processing
- ✅ Added comprehensive timeout protection
- ✅ Enhanced financial calculation accuracy

## Configuration
Environment variables required:
- `OPENAI_API_KEY` - For AI agents
- `REPLIERS_API_KEY` - For MLS data
- `DATABASE_URL` - PostgreSQL connection
- `TAVILY_API_KEY` - For market research

## Notes
- System uses real MLS data for Massachusetts properties
- ADU recommendations based on MA's new ADU-friendly regulations
- All financial projections are conservative and realistic
- Negative cash flow properties are honestly reported
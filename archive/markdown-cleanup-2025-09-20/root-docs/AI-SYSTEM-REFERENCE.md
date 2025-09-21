# ResidentHive AI Investment Intelligence System - Reference Documentation

## System Overview

The AI Investment Intelligence System is a multi-agent AI platform that analyzes real estate investment opportunities by combining market research, legal validation, property search, and financial analysis into comprehensive investment recommendations.

### Core Flow
```
User Query (Natural Language)
    ↓
Requirement Parser
    ↓
Strategy Development (with Legal Validation)
    ↓
Market Discovery
    ↓
Property Search (MLS)
    ↓
Property Analysis
    ↓
Investment Packaging
    ↓
Markdown Report Generation
```

---

## 🤖 AI Agents

### 1. **Requirement Parser**
**Location:** Embedded in `AIInvestmentAdvisor.parseNaturalLanguage()`
**Purpose:** Converts natural language queries into structured requirements
**Capabilities:**
- Understands leverage (e.g., $150k cash = $600-750k property budget)
- Identifies investment goals (cash flow vs appreciation)
- Extracts location preferences
- Determines risk tolerance from context

**Input Example:**
```
"I have $100k cash and want to invest in Worcester MA for rental income"
```

**Output:**
```json
{
  "budget": {"min": 400000, "max": 500000, "cashAvailable": 100000},
  "goals": {"primaryGoal": "cash_flow", "monthlyIncome": 1500},
  "locations": ["Worcester, MA"],
  "preferences": {"propertyTypes": ["multi-family"], "riskTolerance": "low"}
}
```

---

### 2. **Strategy Mind Agent**
**Location:** `/server/ai-agents/strategy-mind-agent.ts`
**Purpose:** Creates investment strategies and validates them against local laws
**Capabilities:**
- Generates 3 strategies (Conservative, Innovative, Aggressive)
- Researches applicable laws and regulations
- Adjusts strategies based on legal findings
- Handles single-family vs multi-family correctly

**Key Methods:**
- `innovateWithValidation()` - Main entry point with legal research
- `identifyResearchNeeds()` - AI determines what laws to research
- `conductLegalResearch()` - Uses Research Mesh to find regulations
- `adjustStrategiesBasedOnLaws()` - Modifies strategies for compliance

**Output:** Three legally-validated investment strategies with implementation steps

---

### 3. **Market Scout Agent**
**Location:** `/server/ai-agents/market-scout-agent.ts`
**Purpose:** Discovers hidden market opportunities and emerging trends
**Capabilities:**
- Scans Massachusetts markets for investment potential
- Identifies hidden catalysts (infrastructure, zoning changes)
- Finds markets before appreciation
- Provides timing recommendations

**Key Methods:**
- `scanMarkets()` - Analyzes multiple markets
- `findLocalOpportunity()` - Deep dive into specific location

**Output:** Ranked markets with opportunities, hidden catalysts, and timing

---

### 4. **Property Genius Agent**
**Location:** `/server/ai-agents/property-genius-agent.ts`
**Purpose:** Analyzes individual properties for investment potential
**Capabilities:**
- Identifies value-add opportunities (ADU potential, renovation upside)
- Calculates investment metrics
- Assesses risks
- Provides AI recommendations (strong buy/buy/hold/pass)

**Key Methods:**
- `analyze()` - Complete property analysis
- Returns confidence scores and hidden opportunities

**Output:** Property insights with opportunities, risks, and recommendations

---

### 5. **Property Hunter Agent**
**Location:** `/server/agents/property-hunter.ts`
**Purpose:** Searches and retrieves real MLS properties
**Capabilities:**
- Integrates with Repliers MLS API
- Filters for investment properties
- Enriches properties with strategic factors
- Handles search widening when needed

**Key Methods:**
- `searchProperties()` - Main search across locations
- `enrichProperties()` - Adds strategic scoring

**Output:** Enriched property list with strategic scores

---

## 🛠️ Core Services

### 1. **AI Investment Advisor**
**Location:** `/server/services/ai-investment-advisor.ts`
**Purpose:** Main orchestrator for the entire system
**Responsibilities:**
- Coordinates all AI agents
- Manages the analysis pipeline
- Generates final recommendations
- Saves reports

**Key Methods:**
- `analyze()` - Main entry point
- `developStrategies()` - Strategy creation with validation
- `findMarkets()` - Market discovery
- `searchProperties()` - Property search
- `packageRecommendations()` - Final packaging

---

### 2. **Research Mesh**
**Location:** `/server/services/research-mesh.ts`
**Purpose:** Automated research and fact discovery
**Capabilities:**
- Uses Tavily API for web research
- Extracts structured facts
- Caches findings in Fact Store

**Key Methods:**
- `researchTopic()` - Research specific questions
- `scrapeWithTavily()` - Web scraping
- `extractFacts()` - Fact extraction with GPT-4

**Status:** ⚠️ Partially working (Tavily integration issues)

---

### 3. **Fact Store**
**Location:** `/server/services/fact-store.ts`
**Purpose:** Persistent storage for researched facts
**Capabilities:**
- Stores ADU regulations, zoning laws, market data
- Provides versioning and expiry
- Organized by topic, scope, and location

**Storage Location:** `/data/fact-store/`

---

### 4. **Investment Report Generator**
**Location:** `/server/services/investment-report-generator.ts`
**Purpose:** Creates shareable Markdown reports
**Capabilities:**
- Generates comprehensive investment reports
- Includes all recommendations, financials, and strategies
- Professional formatting for client sharing

**Output Location:** `/reports/investment-analyses/`

---

## 📊 Data Flow

### Input Sources
1. **User Query** - Natural language investment requirements
2. **MLS Data** - Real properties from Repliers API
3. **Web Research** - Regulations and market data via Tavily
4. **Fact Store** - Cached knowledge base

### Processing Pipeline
1. Parse requirements
2. Develop strategies (with legal validation)
3. Find best markets
4. Search real properties
5. Analyze each property
6. Package recommendations
7. Generate report

### Output Formats
1. **JSON API Response** - Complete analysis data
2. **Markdown Report** - Client-ready document
3. **Phoenix Traces** - Observability data

---

## 🔄 Current Status

### ✅ Fully Implemented
- [x] Multi-agent orchestration
- [x] Natural language understanding
- [x] Strategy generation with property type awareness
- [x] Market discovery (Massachusetts-focused)
- [x] MLS property search
- [x] Property analysis with AI
- [x] Financial projections
- [x] Report generation
- [x] Phoenix/OpenTelemetry tracing

### ⚠️ Partially Working
- [ ] Legal research (Tavily API issues, using fallbacks)
- [ ] Agent debates (simplified version)
- [ ] Strategy verification (needs complete research)

### 🔴 Not Implemented
- [ ] Property image analysis
- [ ] Comparative market analysis
- [ ] Mortgage rate integration
- [ ] Tax calculation
- [ ] Insurance quotes
- [ ] Property management cost estimation

---

## 🚀 Next Steps Recommendations

### High Priority
1. **Fix Research Integration**
   - Debug Tavily API timeout issues
   - Implement caching for successful research
   - Add fallback research sources

2. **Improve Property Type Detection**
   - Better distinguish single-family vs multi-family
   - Accurate unit counting from MLS data
   - Fix strategy assignment based on actual property type

3. **Enhanced Financial Modeling**
   - Add closing costs calculation
   - Include property tax estimates
   - Factor in insurance costs
   - Calculate Cap rates and Cash-on-Cash returns

### Medium Priority
4. **Market Analysis Enhancement**
   - Add comparative market analysis
   - Include demographic trends
   - Crime statistics integration
   - School ratings

5. **Strategy Diversification**
   - More strategy variations
   - Location-specific strategies
   - Market-phase appropriate strategies

6. **User Experience**
   - Web UI for report viewing
   - PDF export capability
   - Email delivery system
   - Save search preferences

### Low Priority
7. **Advanced Features**
   - Property image analysis with GPT-4 Vision
   - Virtual tour integration
   - Neighborhood walkability scores
   - Climate risk assessment
   - HOA analysis

---

## 🐛 Known Issues

1. **Property Type Confusion**
   - Single-family homes being treated as multi-unit
   - Need better MLS data parsing

2. **Research Timeouts**
   - Tavily API calls timing out
   - Need retry logic and better error handling

3. **Strategy Repetition**
   - All properties getting same strategy
   - Need more contextual strategy selection

4. **Performance**
   - Analysis takes 2-3 minutes
   - Could parallelize property analysis

---

## 📁 Project Structure

```
/server/
├── ai-agents/           # AI agent implementations
│   ├── strategy-mind-agent.ts
│   ├── market-scout-agent.ts
│   ├── property-genius-agent.ts
│   └── ai-orchestra.ts
├── agents/              # Legacy agents
│   └── property-hunter.ts
├── services/            # Core services
│   ├── ai-investment-advisor.ts
│   ├── research-mesh.ts
│   ├── fact-store.ts
│   └── investment-report-generator.ts
├── routes/              # API endpoints
│   └── ai-investment-advisor.ts
└── observability/       # Tracing and monitoring
    ├── llm-tracer.ts
    └── withSpan.ts

/reports/                # Generated reports
└── investment-analyses/

/data/                   # Persistent storage
└── fact-store/
```

---

## 🔑 Environment Variables

```env
# Required
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
REPLIERS_API_KEY=...
TAVILY_API_KEY=tvly-...

# Optional
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:6007/v1/traces
```

---

## 📝 Testing

### Test Commands
```bash
# Start server
npx tsx --require dotenv/config server/index.ts

# Test API
curl -X POST http://localhost:3000/api/ai-investment-advisor \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I have $100k to invest in Worcester MA",
    "preferences": {"depth": "standard"}
  }'
```

### Test Scenarios
1. First-time homebuyer with FHA loan
2. Cash investor seeking multi-family
3. House hacking with ADU strategy
4. Fix-and-flip opportunities
5. Long-term appreciation plays

---

## 📈 Metrics

- **Analysis Time:** 2-3 minutes average
- **Properties Analyzed:** 10-50 per search
- **Token Usage:** ~45,000 tokens per analysis
- **Cost:** ~$0.70 per complete analysis
- **Report Size:** 10-15 KB Markdown

---

## 🏗️ Architecture Decisions

1. **Multi-Agent Design**
   - Each agent has specialized expertise
   - Agents can be updated independently
   - Clear separation of concerns

2. **Research-First Approach**
   - Validate strategies before recommending
   - Cache research for efficiency
   - Fallback to safe assumptions

3. **Real MLS Data**
   - Use actual properties, not hypothetical
   - Direct integration with Repliers API
   - Filter out rentals and bad data

4. **Markdown Reports**
   - Human-readable format
   - Easy to convert to PDF
   - Version control friendly

---

## 👥 Team Contributions

This system demonstrates:
- **Advanced AI orchestration** with multiple specialized agents
- **Real-world data integration** with MLS and research APIs
- **Production-ready architecture** with error handling and observability
- **Client-focused output** with professional reports

---

## 📚 Resources

- [Repliers API Documentation](https://docs.repliers.io)
- [OpenAI API Reference](https://platform.openai.com/docs)
- [Tavily Search API](https://tavily.com)
- [Phoenix Observability](https://phoenix.arize.com)

---

*Last Updated: August 2025*
*Version: 1.0.0*
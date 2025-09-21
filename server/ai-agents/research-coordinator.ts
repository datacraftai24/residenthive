/**
 * RESEARCH COORDINATOR AGENT
 * 
 * Purpose: Identify and prioritize market research needs for investment analysis
 * Philosophy: "Why are we using rules when we have LLMs?" - Let the LLM figure out what to research
 * 
 * This agent analyzes client parameters and investment strategies to determine
 * what market data needs to be researched before property evaluation can begin.
 * 
 * NO HARDCODED VALUES - Every number must come from research
 * NO PRESCRIPTIVE LISTS - Let the LLM decide what's needed
 */

import { tracedLLMCall } from '../observability/llm-tracer';
import { CanonicalKey, LABEL_TO_KEY } from '../../shared/metrics/registry';

export interface ClientProfile {
  id: string;
  availableCash: number;
  monthlyIncomeTarget: number;
  location: string;
  creditScore?: number;
  investmentExperience?: 'first_time' | 'some' | 'experienced';
  timeline?: string;
  willingToOwnerOccupy?: boolean;
  usePropertyManagement?: boolean;
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
}

export interface ResearchQuery {
  label: string;           // CURATED label that maps to a key
  query: string;           // The text query for Smart Research Agent
  key?: CanonicalKey;      // Canonical key for deterministic extraction
  category?: string;       // Optional category for organization
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  requiredFor: string[];   // Which strategies need this
}

export interface ResearchNeeds {
  clientId: string;
  location: string;
  timestamp: number;
  researchQueries: ResearchQuery[];
  totalQueries: number;
  estimatedResearchTime: string;
}

export class ResearchCoordinatorAgent {
  private agentName = 'research_coordinator';

  /**
   * Identify research needs based on client profile and strategies
   */
  async identifyResearchNeeds(
    profile: ClientProfile,
    strategies: string[] = ['traditional', 'fha', 'adu', 'section8', 'midterm']
  ): Promise<ResearchNeeds> {
    console.log(`🔍 [ResearchCoordinator] Analyzing research needs for client ${profile.id}`);
    
    const systemPrompt = `You are a real estate investment research coordinator.
Your job is to figure out what market data is needed to evaluate investment properties.
Don't use any hardcoded values or assumptions. Everything must be researched.`;

    const userPrompt = `A client wants to invest in real estate. Analyze their situation and determine what market data you need to research.

CLIENT SITUATION:
${JSON.stringify({
  availableCash: profile.availableCash,
  monthlyIncomeTarget: profile.monthlyIncomeTarget,
  location: profile.location,
  creditScore: profile.creditScore,
  timeline: profile.timeline,
  willingToOwnerOccupy: profile.willingToOwnerOccupy,
  usePropertyManagement: profile.usePropertyManagement
}, null, 2)}

STRATEGIES TO CONSIDER:
${strategies.join(', ')}

CONTEXT TO HELP YOU THINK:
- To calculate cash flow, you need income minus ALL expenses
- Properties have purchase prices that vary by type and location
- Financing has rates, terms, and requirements that affect payments
- Every location has specific rules and regulations
- Markets have trends that affect investment decisions
- Different strategies (like furnished rentals) may have different income potential
- Operating a property has many costs beyond just the mortgage

Think comprehensively about what numbers you need to:
1. Find and purchase suitable properties
2. Calculate accurate monthly cash flow
3. Understand all operating expenses
4. Evaluate each strategy's potential

Remember: Don't assume ANY numbers. Every calculation needs real data.
Generate at least 15-25 research queries to get comprehensive data.

CRITICAL FOR RENT DATA: You MUST request rent for EACH unit type separately:
- Studio apartments (low, median, high)
- 1-bedroom apartments (low, median, high)  
- 2-bedroom apartments (low, median, high)
- 3-bedroom apartments (low, median, high)

Return a JSON object with a "researchQueries" field containing an array of queries.
CRITICAL: Each query MUST have a "label" field from this exact list:
- "single-family median price"
- "2-4 unit median price"
- "studio median rent"
- "studio rent range"
- "1-bedroom median rent"
- "1-bedroom rent range"
- "2-bedroom median rent"
- "2-bedroom rent range"
- "3-bedroom median rent"
- "3-bedroom rent range"
- "days on market range"
- "price per square foot range"
- "30-year conventional rate"
- "FHA interest rate"
- "FHA loan limit"
- "vacancy rate"
- "property tax rate"
- "average insurance cost"

{
  "researchQueries": [
    {
      "label": "property tax rate",  // MUST be from the list above
      "query": "What is the current property tax rate in Worcester MA?",
      "category": "Operating Expenses",
      "priority": "HIGH",
      "requiredFor": ["all"]
    },
    // ... more queries
  ]
}

ONLY use the labels from the list above. Queries without valid labels will be dropped.
Make queries specific and answerable. Each should request one piece of data.`;

    try {
      const startTime = Date.now();
      
      const result = await tracedLLMCall({
        agentName: this.agentName,
        systemPrompt,
        userPrompt,
        temperature: 0.7,
        model: 'gpt-4o',
        responseFormat: 'json_object'
      });

      console.log(`   🔍 LLM Response: ${result.content.substring(0, 200)}...`);
      
      const queries = JSON.parse(result.content);
      
      // Ensure we have an array of queries - check multiple possible formats
      let researchQueries = [];
      if (Array.isArray(queries)) {
        researchQueries = queries;
      } else if (queries.researchQueries && Array.isArray(queries.researchQueries)) {
        researchQueries = queries.researchQueries;
      } else if (queries.queries && Array.isArray(queries.queries)) {
        researchQueries = queries.queries;
      } else {
        console.log(`   ⚠️ Unexpected response format:`, Object.keys(queries));
      }
      
      // Add canonical keys to queries
      researchQueries = this.attachCanonicalKeys(researchQueries);
      
      // Log what the LLM decided to research
      console.log(`✅ [ResearchCoordinator] LLM identified ${researchQueries.length} research queries`);
      console.log(`   Categories: ${[...new Set(researchQueries.map(q => q.category))].join(', ')}`);
      console.log(`   High priority: ${researchQueries.filter(q => q.priority === 'HIGH').length}`);
      console.log(`   With keys: ${researchQueries.filter(q => q.key).length}`);
      console.log(`   Processing time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

      // Sample of what the LLM decided
      if (researchQueries.length > 0) {
        console.log(`   Sample queries LLM generated:`);
        researchQueries.slice(0, 3).forEach(q => {
          console.log(`     - ${q.category}: "${q.query.substring(0, 60)}..."`);
        });
      }

      return {
        clientId: profile.id,
        location: profile.location,
        timestamp: Date.now(),
        researchQueries,
        totalQueries: researchQueries.length,
        estimatedResearchTime: `${Math.ceil(researchQueries.length * 0.5)} minutes`
      };

    } catch (error) {
      console.error(`❌ [ResearchCoordinator] Failed to identify research needs:`, error);
      throw new Error(`Research coordination failed: ${error.message}`);
    }
  }

  /**
   * Attach canonical keys to research queries for deterministic extraction
   */
  private attachCanonicalKeys(queries: ResearchQuery[]): ResearchQuery[] {
    const out: ResearchQuery[] = [];
    let dropped = 0;
    
    for (const q of queries) {
      // Skip if already has key
      if (q.key) {
        out.push(q);
        continue;
      }
      
      // Map label to key using curated map - NO REGEX!
      const key = LABEL_TO_KEY[q.label];
      if (!key) {
        console.warn(`   ⚠️ [keys] unmapped label: "${q.label}" -> dropping query`);
        dropped++;
        continue;
      }
      
      out.push({ ...q, key });
    }
    
    // Coverage metric - FORCE VISIBILITY
    const total = queries.length;
    const attached = out.length;
    const coverage = Math.round((attached / Math.max(1, total)) * 100);
    console.log(`   📊 [keys] attached=${attached}/${total} (${coverage}%) dropped=${dropped}`);
    
    // Alert if coverage is too low
    if (coverage < 80) {
      console.warn(`   ⚠️ KEY COVERAGE TOO LOW: ${coverage}% (target: 80%+)`);
    }
    
    return out;
  }

  /**
   * Prioritize queries for execution based on dependencies
   */
  prioritizeQueries(queries: ResearchQuery[]): ResearchQuery[] {
    // Sort by priority and group by category
    return queries.sort((a, b) => {
      // Priority order
      const priorityOrder = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Within same priority, group by category
      return a.category.localeCompare(b.category);
    });
  }

  /**
   * Filter queries relevant to specific strategies
   */
  filterByStrategies(queries: ResearchQuery[], strategies: string[]): ResearchQuery[] {
    return queries.filter(query => {
      // If query is for 'all' strategies, include it
      if (query.requiredFor.includes('all')) return true;
      
      // Check if any required strategy matches our list
      return query.requiredFor.some(req => strategies.includes(req));
    });
  }

  /**
   * Get essential queries only (HIGH priority)
   */
  getEssentialQueries(queries: ResearchQuery[]): ResearchQuery[] {
    return queries.filter(q => q.priority === 'HIGH');
  }

  /**
   * Estimate total research time
   */
  estimateResearchTime(queries: ResearchQuery[]): string {
    // All queries now use advanced search (60 seconds estimate each)
    const totalSeconds = queries.length * 60;
    const minutes = Math.ceil(totalSeconds / 60);
    
    if (minutes < 5) return 'Under 5 minutes';
    if (minutes < 10) return '5-10 minutes';
    if (minutes < 20) return '10-20 minutes';
    return `${minutes} minutes`;
  }

  /**
   * Generate research summary for logging
   */
  generateResearchSummary(needs: ResearchNeeds): string {
    const categories = [...new Set(needs.researchQueries.map(q => q.category))];
    const highPriority = needs.researchQueries.filter(q => q.priority === 'HIGH').length;
    
    return `Research Plan for ${needs.location}:
- Total queries: ${needs.totalQueries}
- Categories: ${categories.join(', ')}
- High priority: ${highPriority}
- Estimated time: ${needs.estimatedResearchTime}`;
  }
}

// Export singleton instance
export const researchCoordinator = new ResearchCoordinatorAgent();
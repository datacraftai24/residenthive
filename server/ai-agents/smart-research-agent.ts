/**
 * SMART RESEARCH AGENT
 * 
 * Purpose: Execute research based on text instructions
 * Philosophy: "Why use rules when we have LLMs?" - No hardcoded logic
 * 
 * This agent takes natural language research requests and:
 * 1. Understands what data is being requested
 * 2. Executes advanced search via Tavily
 * 3. Extracts the specific data requested
 * 4. Returns structured results for other agents
 */

import { tavilyService } from '../services/tavily-service';
import { tracedLLMCall } from '../observability/llm-tracer';
import { researchValidator } from '../services/research-validator';

export interface ResearchResult {
  question: string;        // Original research question
  searchQuery: string;     // What we actually searched for
  answer: any;            // The extracted data (number, string, object)
  originalAnswer?: any;    // Original before validation (if corrected)
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'CORRECTED';
  sources: Array<{
    title: string;
    url: string;
    relevantContent: string;
  }>;
  context: string;        // Brief explanation of what was found
  timestamp: number;
  category?: string;      // Optional category for organization
  validation?: {          // Validation results if applicable
    corrected: boolean;
    issues: string[];
    metrics?: {
      correctionRate: number;
      avgCorrection: number;
    };
  };
}

export class SmartResearchAgent {
  private agentName = 'smart_research_agent';
  private cache: Map<string, ResearchResult> = new Map();
  private cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Execute a single research request
   */
  async doResearch(
    query: string,
    category?: string
  ): Promise<ResearchResult> {
    console.log(`🔍 [SmartResearch] Processing: "${query}"`);
    if (category) {
      console.log(`   📁 Category: ${category}`);
    }

    // Check cache
    const cacheKey = `${query}_${Math.floor(Date.now() / this.cacheTimeout)}`;
    if (this.cache.has(cacheKey)) {
      console.log(`   ✅ Using cached result`);
      return this.cache.get(cacheKey)!;
    }

    try {
      // Step 1: Understand what we're looking for
      const searchQuery = await this.formulateSearchQuery(query);
      console.log(`   🔎 Search query: "${searchQuery}"`);

      // Step 2: Execute advanced search via Tavily
      const searchResults = await tavilyService.search(searchQuery, {
        searchDepth: 'advanced',  // Always use advanced for best results
        maxResults: 5,
        includeAnswer: true,
        includeRawContent: true
      });

      // Step 3: Extract the specific data requested
      const extractedData = await this.extractRequestedData(
        query,
        searchResults
      );

      // Step 4: Assess confidence based on results
      const confidence = this.assessConfidence(searchResults, extractedData);

      // Step 5: Format sources
      const sources = this.formatSources(searchResults);

      // Step 5.5: Validate rent data if this is a rent query
      let validatedAnswer = extractedData.value;
      let validationInfo = undefined;
      let wasValidated = false;
      
      if (this.isRentQuery(query) && extractedData.value) {
        const validation = this.validateRentAnswer(query, extractedData.value);
        if (validation) {
          validatedAnswer = validation.corrected;
          validationInfo = validation.info;
          wasValidated = true;
          (confidence as any) = 'CORRECTED';
          console.log(`   ⚠️ [VALIDATOR] Corrected rent data for: ${query}`);
        }
      }

      // Step 6: Create result
      const result: ResearchResult = {
        question: query,
        searchQuery,
        answer: validatedAnswer,
        originalAnswer: wasValidated ? extractedData.value : undefined,
        confidence,
        sources,
        context: extractedData.context || searchResults.answer,
        timestamp: Date.now(),
        category,
        validation: validationInfo
      };

      // Cache the result
      this.cache.set(cacheKey, result);

      console.log(`   ✅ Found: ${JSON.stringify(extractedData.value).substring(0, 100)}...`);
      console.log(`   📊 Confidence: ${confidence}`);

      return result;

    } catch (error) {
      console.error(`   ❌ Research failed: ${error.message}`);
      
      return {
        question: query,
        searchQuery: query,
        answer: null,
        confidence: 'LOW',
        sources: [],
        context: `Research failed: ${error.message}`,
        timestamp: Date.now(),
        category
      };
    }
  }

  /**
   * Validate collected rent data for monotonicity
   * This is called after collecting all rent research to ensure consistency
   */
  validateCollectedRentData(
    results: ResearchResult[],
    location: string
  ): { validated: ResearchResult[]; issues: string[] } {
    // Extract rent results
    const rentResults = results.filter(r => this.isRentQuery(r.question));
    if (rentResults.length === 0) {
      return { validated: results, issues: [] };
    }

    // Build rent data structure
    const rentData: Record<string, { median?: number | null }> = {};
    for (const result of rentResults) {
      const unitType = this.extractUnitType(result.question);
      if (unitType && typeof result.answer === 'number') {
        rentData[unitType] = { median: result.answer };
      }
    }

    // Validate with our enforcer
    const validation = researchValidator.validateRentData(location, rentData);
    
    if (!validation.valid && validation.corrected) {
      console.log(`\n⚠️ [VALIDATOR] Correcting rent data for ${location}`);
      console.log(`   Issues: ${validation.issues.join(', ')}`);
      
      // Update results with corrected values
      const updatedResults = results.map(result => {
        if (this.isRentQuery(result.question)) {
          const unitType = this.extractUnitType(result.question);
          if (unitType && validation.corrected[unitType]) {
            const corrected = validation.corrected[unitType];
            if (corrected.source !== 'original') {
              return {
                ...result,
                originalAnswer: result.answer,
                answer: corrected.median,
                confidence: 'CORRECTED' as any,
                validation: {
                  corrected: true,
                  issues: validation.issues,
                  metrics: validation.metrics
                }
              };
            }
          }
        }
        return result;
      });
      
      return { validated: updatedResults, issues: validation.issues };
    }
    
    return { validated: results, issues: [] };
  }

  /**
   * Execute multiple research requests in parallel
   */
  async doResearchBatch(
    queries: Array<{ query: string; category?: string; key?: string }>,
    location?: string
  ): Promise<ResearchResult[]> {
    console.log(`\n🔬 [SmartResearch] Processing ${queries.length} research requests in parallel`);
    
    // ENFORCE: Every query MUST have a key
    const validQueries = queries.filter(q => {
      if (!q.key) {
        console.error(`❌ [SmartResearch] DROPPING query without key: "${q.query.substring(0, 50)}..."`);
        return false;
      }
      return true;
    });
    
    if (validQueries.length === 0) {
      throw new Error('[SmartResearch] No valid queries with keys to process');
    }
    
    console.log(`   Processing ${validQueries.length} keyed queries (dropped ${queries.length - validQueries.length} without keys)`);
    
    const results = await Promise.all(
      validQueries.map(async ({ query, category, key }) => {
        const result = await this.doResearch(query, category);
        // Attach the canonical key to the result - MANDATORY
        (result as any).key = key;
        return result;
      })
    );

    const successful = results.filter(r => r.confidence !== 'LOW').length;
    console.log(`✅ Batch complete: ${successful}/${validQueries.length} successful`);

    // Validate collected rent data if location provided
    if (location) {
      const { validated, issues } = this.validateCollectedRentData(results, location);
      if (issues.length > 0) {
        console.log(`⚠️ [VALIDATOR] Applied rent corrections for ${location}`);
      }
      return validated;
    }

    return results;
  }

  /**
   * Formulate an optimized search query from the research request
   */
  private async formulateSearchQuery(request: string): Promise<string> {
    // For simple requests, we might just return as-is
    // For complex requests, we might optimize for search engines
    
    const systemPrompt = `You are a search query optimizer.
Convert research requests into effective search queries.
Keep location and specifics intact.
Add year 2024 or 2025 for current data.`;

    const userPrompt = `Convert this research request into a search query:
"${request}"

Return only the search query, nothing else.`;

    try {
      const result = await tracedLLMCall({
        agentName: this.agentName,
        systemPrompt,
        userPrompt,
        temperature: 0.3,
        model: 'gpt-4o-mini'
      });

      return result.content.trim();
    } catch (error) {
      // Fallback: use original query
      return request;
    }
  }

  /**
   * Extract the specific data requested from search results
   */
  private async extractRequestedData(
    originalRequest: string,
    searchResults: any
  ): Promise<{ value: any; context?: string }> {
    if (!searchResults || !searchResults.answer) {
      return { value: null, context: 'No search results found' };
    }

    const systemPrompt = `You are a data extraction specialist.
Extract ONLY the specific data requested.
Return numbers as numbers, percentages as decimals.
Be precise and literal - no interpretation.`;

    const userPrompt = `Original request: "${originalRequest}"

Search results:
${searchResults.answer}

Additional context from sources:
${searchResults.results?.slice(0, 3).map((r: any) => 
  `- ${r.title}: ${r.content?.substring(0, 200)}`
).join('\n')}

Extract the specific data requested. 

IMPORTANT: For rent queries:
- If asking for "studio median rent", return a single number
- If asking for "1-bedroom median rent", return a single number  
- If asking for "2-bedroom median rent", return a single number
- If asking for "3-bedroom median rent", return a single number
- If asking for rent ranges, return {"min": number, "max": number}

Return JSON:
{
  "value": <the specific data requested>,
  "context": "<brief explanation of what was found>",
  "unit": "<unit if applicable, e.g., 'percent', 'dollars', 'per_sqft'>"
}`;

    try {
      const result = await tracedLLMCall({
        agentName: this.agentName,
        systemPrompt,
        userPrompt,
        temperature: 0.1,  // Very low temperature for precision
        model: 'gpt-4o-mini',
        responseFormat: 'json_object'
      });

      return JSON.parse(result.content);
    } catch (error) {
      // Fallback: return the raw answer
      return {
        value: searchResults.answer,
        context: 'Direct answer from search'
      };
    }
  }

  /**
   * Assess confidence in the research results
   */
  private assessConfidence(searchResults: any, extractedData: any): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (!searchResults || !extractedData.value) return 'LOW';
    
    // HIGH confidence criteria:
    // - Have specific numeric value or clear answer
    // - Multiple sources (3+) confirm the data
    // - Recent results (URLs contain 2024/2025)
    if (extractedData.value && searchResults.results?.length >= 3) {
      const hasRecentData = searchResults.results.some((r: any) => 
        r.url?.includes('2024') || r.url?.includes('2025') || 
        r.publishedDate?.includes('2024') || r.publishedDate?.includes('2025')
      );
      if (hasRecentData) return 'HIGH';
    }
    
    // MEDIUM confidence: Have data but fewer sources or older
    if (extractedData.value && searchResults.results?.length >= 1) {
      return 'MEDIUM';
    }
    
    return 'LOW';
  }

  /**
   * Format sources for output
   */
  private formatSources(searchResults: any): ResearchResult['sources'] {
    if (!searchResults.results) return [];

    return searchResults.results.slice(0, 3).map((result: any) => ({
      title: result.title || 'Untitled',
      url: result.url || '',
      relevantContent: result.content?.substring(0, 200) || ''
    }));
  }

  /**
   * Clear cache (useful for testing or forcing fresh data)
   */
  clearCache(): void {
    this.cache.clear();
    console.log(`🗑️ [SmartResearch] Cache cleared`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; timeout: number } {
    return {
      size: this.cache.size,
      timeout: this.cacheTimeout
    };
  }

  /**
   * Check if a query is asking for rent data
   */
  private isRentQuery(query: string): boolean {
    const rentPatterns = [
      /rent.*studio/i,
      /studio.*rent/i,
      /rent.*1[\s-]?b(ed)?r(oom)?/i,
      /1[\s-]?b(ed)?r(oom)?.*rent/i,
      /rent.*2[\s-]?b(ed)?r(oom)?/i,
      /2[\s-]?b(ed)?r(oom)?.*rent/i,
      /rent.*3[\s-]?b(ed)?r(oom)?/i,
      /3[\s-]?b(ed)?r(oom)?.*rent/i,
      /median.*rent/i,
      /average.*rent/i,
      /rent.*range/i
    ];
    
    return rentPatterns.some(pattern => pattern.test(query));
  }

  /**
   * Validate and correct rent data for monotonicity
   */
  private validateRentAnswer(query: string, answer: any): { corrected: any; info: any } | null {
    // Skip if not a number
    if (typeof answer !== 'number' || isNaN(answer)) {
      return null;
    }
    
    // Extract location from query
    const locationMatch = query.match(/in\s+([^?]+?)(?:\s+for|\s+\?|$)/i);
    const location = locationMatch ? locationMatch[1].trim() : 'unknown';
    
    // Identify unit type from query
    const unitType = this.extractUnitType(query);
    if (!unitType) return null;
    
    // For now, we'll just validate individual values are reasonable
    // Full validation happens when all rent data is collected
    if (answer < 300) {
      console.warn(`⚠️ [VALIDATOR] Suspiciously low rent for ${unitType}: $${answer}`);
      // Minimum reasonable rent
      const corrected = unitType === 'studio' ? 800 : 
                       unitType === 'oneBR' ? 1000 :
                       unitType === 'twoBR' ? 1400 : 1800;
      
      return {
        corrected,
        info: {
          corrected: true,
          issues: [`${unitType}_TOO_LOW`],
          metrics: {
            correctionRate: 1,
            avgCorrection: Math.abs(corrected - answer)
          }
        }
      };
    }
    
    if (answer > 10000) {
      console.warn(`⚠️ [VALIDATOR] Suspiciously high rent for ${unitType}: $${answer}`);
      // Maximum reasonable rent for most markets
      const corrected = unitType === 'studio' ? 2000 : 
                       unitType === 'oneBR' ? 2500 :
                       unitType === 'twoBR' ? 3500 : 4500;
      
      return {
        corrected,
        info: {
          corrected: true,
          issues: [`${unitType}_TOO_HIGH`],
          metrics: {
            correctionRate: 1,
            avgCorrection: Math.abs(answer - corrected)
          }
        }
      };
    }
    
    return null;
  }

  /**
   * Extract unit type from query string
   */
  private extractUnitType(query: string): 'studio' | 'oneBR' | 'twoBR' | 'threeBR' | null {
    if (/studio/i.test(query)) return 'studio';
    if (/1[\s-]?b(ed)?r(oom)?/i.test(query)) return 'oneBR';
    if (/2[\s-]?b(ed)?r(oom)?/i.test(query)) return 'twoBR';
    if (/3[\s-]?b(ed)?r(oom)?/i.test(query)) return 'threeBR';
    return null;
  }
}

/**
 * Attach key or reject - enforces canonical key requirement
 */
export function attachKeyOrReject(row: {
  id?: string; 
  question: string; 
  answer: any;
  key?: string;
}): { id: string; key: string; answer: any } {
  // Derive key patterns
  const deriveKey = (q: string): string | undefined => {
    const map: Array<[RegExp, string]> = [
      [/2[\-\s]?4.*(median|price)/i, 'mf_price_median'],
      [/(single|sf).*(median|price)/i, 'sf_price_median'],
      [/average.*2.?br.*rent(?!al)/i, 'avg_rent_2br'],
      [/2.?br.*rent.*(range|p10|p90)/i, 'rent_range_2br'],
      [/days on market|dom/i, 'dom_p10_p90'],
      [/(price|sale).*\$\/?sf|psf/i, 'sale_psf_p10_p90'],
      [/(30|thirty).*(year|yr).*conventional.*rate/i, 'rate_30yr_conventional'],
      [/\bfha\b.*rate/i, 'rate_fha'],
      [/vacancy.*rate/i, 'vacancy_rate'],
      [/property.*tax/i, 'tax_rate'],
      [/insurance.*(cost|premium)/i, 'insurance_avg']
    ];
    return map.find(([re]) => re.test(q))?.[1];
  };
  
  const key = row.key || deriveKey(row.question || '');
  if (!key) {
    console.error('❌ Research row missing canonical key', { 
      id: row.id, 
      q: row.question?.substring(0, 50) 
    });
    throw new Error(`Research row missing canonical key: "${row.question?.substring(0, 50)}..."`);
  }
  
  return { 
    id: row.id || `research_${Date.now()}`, 
    key, 
    answer: row.answer 
  };
}

// Export singleton instance
export const smartResearchAgent = new SmartResearchAgent();
/**
 * Tavily Search Service
 * 
 * Provides real-time web search capabilities for investment strategy enhancement
 * Fetches current market data, economic trends, and local market insights
 */

interface TavilySearchResponse {
  query: string;
  follow_up_questions: string[] | null;
  answer: string;
  images: string[];
  results: TavilyResult[];
  response_time: number;
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
  score: number;
  published_date?: string;
}

interface MarketInsight {
  query: string;
  summary: string;
  keyPoints: string[];
  sources: { title: string; url: string; date?: string }[];
  confidence: number;
  lastUpdated: string;
}

export class TavilyService {
  private apiKey: string;
  private baseUrl = 'https://api.tavily.com';

  constructor() {
    this.apiKey = process.env.TAVILY_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️  TAVILY_API_KEY not found. Real-time market research disabled.');
    }
  }

  /**
   * Check if Tavily service is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Search for current market data for a specific location and investment type
   */
  async getMarketInsights(location: string, investorType: string): Promise<MarketInsight | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const query = this.buildMarketQuery(location, investorType);
      const searchResults = await this.search(query);
      
      return this.processMarketResults(query, searchResults);
    } catch (error) {
      console.error('Tavily market insights error:', error);
      return null;
    }
  }

  /**
   * Get economic trends and forecasts for investment planning
   */
  async getEconomicTrends(location: string): Promise<MarketInsight | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const query = `${location} real estate market forecast 2025 economic trends interest rates housing market`;
      const searchResults = await this.search(query);
      
      return this.processMarketResults(query, searchResults);
    } catch (error) {
      console.error('Tavily economic trends error:', error);
      return null;
    }
  }

  /**
   * Research specific property investment opportunities
   */
  async researchInvestmentOpportunity(location: string, propertyType: string, budget: number): Promise<MarketInsight | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const budgetRange = this.formatBudgetForSearch(budget);
      const query = `${location} ${propertyType} investment opportunities ${budgetRange} cap rates rental yields 2025`;
      const searchResults = await this.search(query);
      
      return this.processMarketResults(query, searchResults);
    } catch (error) {
      console.error('Tavily investment opportunity research error:', error);
      return null;
    }
  }

  /**
   * Get local market regulations and tax implications
   */
  async getLocalRegulations(location: string, investorType: string): Promise<MarketInsight | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const query = `${location} real estate investment regulations tax laws ${investorType} rental property rules 2025`;
      const searchResults = await this.search(query);
      
      return this.processMarketResults(query, searchResults);
    } catch (error) {
      console.error('Tavily regulations research error:', error);
      return null;
    }
  }

  /**
   * Perform raw Tavily search
   */
  private async search(query: string, options: {
    search_depth?: 'basic' | 'advanced';
    max_results?: number;
    include_answer?: boolean;
    include_raw_content?: boolean;
  } = {}): Promise<TavilySearchResponse> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        search_depth: options.search_depth || 'basic',
        max_results: options.max_results || 5,
        include_answer: options.include_answer ?? true,
        include_raw_content: options.include_raw_content ?? false,
        ...options
      })
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Build market-specific search query
   */
  private buildMarketQuery(location: string, investorType: string): string {
    const typeQueries = {
      rental_income: `${location} rental income properties cash flow cap rates neighborhood analysis`,
      multi_unit: `${location} multi-family apartment buildings investment opportunities market trends`,
      flip: `${location} house flipping opportunities renovation costs market demand`,
      house_hack: `${location} house hacking duplex triplex owner-occupied investment strategies`
    };

    return typeQueries[investorType as keyof typeof typeQueries] || 
           `${location} real estate investment opportunities ${investorType}`;
  }

  /**
   * Format budget for search queries
   */
  private formatBudgetForSearch(budget: number): string {
    if (budget < 200000) return 'under $200k';
    if (budget < 500000) return '$200k-$500k';
    if (budget < 1000000) return '$500k-$1M';
    if (budget < 2000000) return '$1M-$2M';
    return 'over $2M';
  }

  /**
   * Process search results into market insights
   */
  private processMarketResults(query: string, searchResults: TavilySearchResponse): MarketInsight {
    const keyPoints = this.extractKeyPoints(searchResults);
    const sources = searchResults.results.map(result => ({
      title: result.title,
      url: result.url,
      date: result.published_date
    }));

    return {
      query,
      summary: searchResults.answer || this.generateSummary(searchResults.results),
      keyPoints,
      sources,
      confidence: this.calculateConfidence(searchResults),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Extract key points from search results
   */
  private extractKeyPoints(searchResults: TavilySearchResponse): string[] {
    const points: string[] = [];
    
    // Add follow-up questions as key points
    if (searchResults.follow_up_questions) {
      points.push(...searchResults.follow_up_questions);
    }

    // Extract key insights from top results
    searchResults.results.slice(0, 3).forEach(result => {
      const content = result.content.split('.').slice(0, 2).join('.');
      if (content.length > 50) {
        points.push(content);
      }
    });

    return points.slice(0, 5); // Limit to 5 key points
  }

  /**
   * Generate summary if no answer is provided
   */
  private generateSummary(results: TavilyResult[]): string {
    if (results.length === 0) return 'No current market data found.';
    
    const topResult = results[0];
    return topResult.content.split('.').slice(0, 3).join('.') + '.';
  }

  /**
   * Calculate confidence score based on result quality
   */
  private calculateConfidence(searchResults: TavilySearchResponse): number {
    const factors = {
      hasAnswer: searchResults.answer ? 30 : 0,
      resultCount: Math.min(searchResults.results.length * 10, 40),
      avgScore: searchResults.results.reduce((sum, r) => sum + r.score, 0) / 
                Math.max(searchResults.results.length, 1) * 30,
      recentResults: searchResults.results.filter(r => 
        r.published_date && new Date(r.published_date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ).length * 5 // Bonus for recent results
    };

    return Math.min(
      Math.round(factors.hasAnswer + factors.resultCount + factors.avgScore + factors.recentResults),
      100
    );
  }
}

// Export singleton instance
export const tavilyService = new TavilyService();
/**
 * City Rent Tables Service
 * 
 * Purpose: Provide deterministic rent values based on frozen tables
 * Philosophy: Build once from research, freeze, never drift during evaluation
 * 
 * Key features:
 * - Tables are built from research data at strategy generation time
 * - Once set, tables are immutable (deep frozen)
 * - Provides consistent rent values throughout evaluation
 * - No micro-areas, no floating bands
 */

export interface RentByCondition {
  A: number;  // Premium condition
  B: number;  // Average condition  
  C: number;  // Below average condition
}

export interface CityRentTable {
  'STUDIO': RentByCondition;
  '1BR': RentByCondition;
  '2BR': RentByCondition;
  '3BR': RentByCondition;
  '4BR'?: RentByCondition;
}

export interface RentTableMetadata {
  city: string;
  timestamp: number;
  sources: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export class CityRentTablesService {
  private tables = new Map<string, CityRentTable>();
  private metadata = new Map<string, RentTableMetadata>();
  
  /**
   * Set the rent table for a city (called once per strategy generation)
   * The table is deep frozen to prevent any modification during evaluation
   */
  setTableForCity(city: string, table: CityRentTable, metadata?: RentTableMetadata): void {
    const cityKey = this.normalizeCityKey(city);
    
    // Deep freeze the table to make it immutable
    const frozen = this.deepFreeze(table);
    this.tables.set(cityKey, frozen);
    
    if (metadata) {
      this.metadata.set(cityKey, Object.freeze(metadata));
    }
    
    console.log(`📊 [RentTables] Set frozen table for ${city}:`, {
      studio: table.STUDIO,
      '1br': table['1BR'],
      '2br': table['2BR'],
      '3br': table['3BR']
    });
  }
  
  /**
   * Get rent for a specific unit type and condition
   * Returns a deterministic value from the frozen table
   */
  getRent(city: string, unitType: string | number, condition?: string): number {
    const cityKey = this.normalizeCityKey(city);
    const table = this.tables.get(cityKey);
    
    if (!table) {
      console.error(`❌ No rent table for ${city}`);
      // Return conservative default rather than throwing
      return this.getConservativeDefault(unitType);
    }
    
    const type = this.normalizeUnitType(unitType);
    const cond = this.normalizeCondition(condition);
    
    // Get the rent for this unit type
    const typeRents = table[type];
    if (!typeRents) {
      console.warn(`⚠️ No rent data for ${type} in ${city}, using 2BR as proxy`);
      const fallback = table['2BR'] || table['1BR'];
      return fallback?.[cond] || this.getConservativeDefault(unitType);
    }
    
    const rent = typeRents[cond];
    if (!rent) {
      console.warn(`⚠️ No rent for condition ${cond}, using B`);
      return typeRents['B'] || typeRents['C'] || Object.values(typeRents)[0];
    }
    
    return rent;
  }
  
  /**
   * Build a rent table from research data
   * This is called by Strategy Builder to create the frozen table
   */
  buildTableFromResearch(city: string, researchData: any[]): CityRentTable {
    // Extract rent points from research
    const rentPoints = this.extractRentPoints(researchData);
    
    // Build the table with A/B/C conditions
    const table: CityRentTable = {
      'STUDIO': this.buildConditionRents(rentPoints.studio),
      '1BR': this.buildConditionRents(rentPoints.oneBR),
      '2BR': this.buildConditionRents(rentPoints.twoBR),
      '3BR': this.buildConditionRents(rentPoints.threeBR)
    };
    
    // Add 4BR if data available
    if (rentPoints.fourBR) {
      table['4BR'] = this.buildConditionRents(rentPoints.fourBR);
    }
    
    return table;
  }
  
  /**
   * Check if a table exists for a city
   */
  hasTableForCity(city: string): boolean {
    return this.tables.has(this.normalizeCityKey(city));
  }
  
  /**
   * Get metadata for a city's rent table
   */
  getMetadata(city: string): RentTableMetadata | undefined {
    return this.metadata.get(this.normalizeCityKey(city));
  }
  
  // ============= PRIVATE HELPERS =============
  
  private normalizeCityKey(city: string): string {
    // Remove state, normalize case
    return city.toLowerCase()
      .replace(/,?\s*(ma|massachusetts)$/i, '')
      .trim();
  }
  
  private normalizeUnitType(input: string | number): keyof CityRentTable {
    // Handle numeric input (bedroom count)
    if (typeof input === 'number') {
      if (input === 0) return 'STUDIO';
      if (input === 1) return '1BR';
      if (input === 2) return '2BR';
      if (input === 3) return '3BR';
      if (input >= 4) return '4BR' as keyof CityRentTable;
      return '1BR'; // Conservative default
    }
    
    // Handle string input
    const normalized = input.toUpperCase();
    if (normalized.includes('STUDIO') || normalized === '0BR') return 'STUDIO';
    if (normalized.includes('1') || normalized === '1BR') return '1BR';
    if (normalized.includes('2') || normalized === '2BR') return '2BR';
    if (normalized.includes('3') || normalized === '3BR') return '3BR';
    if (normalized.includes('4') || normalized === '4BR') return '4BR' as keyof CityRentTable;
    
    // Conservative default
    return '1BR';
  }
  
  private normalizeCondition(input?: string): 'A' | 'B' | 'C' {
    if (!input) return 'B'; // Default to average
    
    const upper = input.toUpperCase();
    
    // Premium conditions
    if (upper === 'A' || upper === 'A+' || upper.includes('EXCEL') || upper.includes('PREMIUM')) {
      return 'A';
    }
    
    // Below average conditions
    if (upper === 'C' || upper === 'C-' || upper === 'D' || upper.includes('POOR') || upper.includes('FAIR')) {
      return 'C';
    }
    
    // Everything else is average
    return 'B';
  }
  
  private buildConditionRents(rentData?: { low?: number; median?: number; high?: number }): RentByCondition {
    if (!rentData || !rentData.median) {
      // Return conservative defaults if no data
      return { A: 1500, B: 1200, C: 1000 };
    }
    
    const median = rentData.median;
    
    // Build A/B/C from research data
    return {
      A: rentData.high || Math.round(median * 1.25),  // Premium = high or +25%
      B: median,                                        // Average = median
      C: rentData.low || Math.round(median * 0.80)     // Below = low or -20%
    };
  }
  
  private extractRentPoints(researchData: any[]): any {
    const points: any = {};
    
    for (const item of researchData) {
      const question = item.question?.toLowerCase() || '';
      const answer = item.answer;
      
      if (question.includes('studio')) {
        points.studio = this.parseRentAnswer(answer);
      } else if (question.includes('1-bedroom') || question.includes('1 bedroom')) {
        points.oneBR = this.parseRentAnswer(answer);
      } else if (question.includes('2-bedroom') || question.includes('2 bedroom')) {
        points.twoBR = this.parseRentAnswer(answer);
      } else if (question.includes('3-bedroom') || question.includes('3 bedroom')) {
        points.threeBR = this.parseRentAnswer(answer);
      } else if (question.includes('4-bedroom') || question.includes('4 bedroom')) {
        points.fourBR = this.parseRentAnswer(answer);
      }
    }
    
    return points;
  }
  
  private parseRentAnswer(answer: any): { low?: number; median?: number; high?: number } {
    if (typeof answer === 'number') {
      return { median: answer };
    }
    
    if (typeof answer === 'object') {
      return {
        low: answer.low || answer.min || answer['25th'] || answer.p25,
        median: answer.median || answer.average || answer.mean,
        high: answer.high || answer.max || answer['75th'] || answer.p75
      };
    }
    
    if (typeof answer === 'string') {
      // Try to extract number from string
      const match = answer.match(/\$?([\d,]+)/);
      if (match) {
        const value = parseInt(match[1].replace(/,/g, ''));
        return { median: value };
      }
    }
    
    return {};
  }
  
  private getConservativeDefault(unitType: string | number): number {
    // Very conservative defaults when no data available
    if (typeof unitType === 'number') {
      if (unitType === 0) return 900;   // Studio
      if (unitType === 1) return 1200;  // 1BR
      if (unitType === 2) return 1500;  // 2BR
      if (unitType === 3) return 1800;  // 3BR
      return 2000; // 4BR+
    }
    
    return 1200; // Default to 1BR conservative
  }
  
  private deepFreeze<T>(obj: T): T {
    Object.freeze(obj);
    
    Object.getOwnPropertyNames(obj).forEach(prop => {
      const value = (obj as any)[prop];
      if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
        this.deepFreeze(value);
      }
    });
    
    return obj;
  }
}

// Export singleton instance
export const cityRentTables = new CityRentTablesService();
// Investment Property Type Mapper based on Repliers aggregates data
// Data from: https://api.repliers.io/listings?aggregates=details.style

export interface PropertyStyleData {
  style: string;
  count: number;
  investmentPotential: 'high' | 'medium' | 'low';
  cashFlowPotential: number; // Expected units for rental
}

// Multi-family investment properties ranked by availability and investment potential
export const INVESTMENT_PROPERTY_STYLES: PropertyStyleData[] = [
  {
    style: 'Single Family Residence',
    count: 8363,
    investmentPotential: 'medium',
    cashFlowPotential: 1
  },
  {
    style: 'Multi Family',
    count: 362,
    investmentPotential: 'high',
    cashFlowPotential: 4
  },
  {
    style: '3 Family',
    count: 261,
    investmentPotential: 'high',
    cashFlowPotential: 3
  },
  {
    style: '2 Family - 2 Units Up/Down',
    count: 224,
    investmentPotential: 'high',
    cashFlowPotential: 2
  },
  {
    style: '5-9 Family',
    count: 108,
    investmentPotential: 'high',
    cashFlowPotential: 7
  },
  {
    style: '3 Family - 3 Units Up/Down',
    count: 89,
    investmentPotential: 'high',
    cashFlowPotential: 3
  },
  {
    style: '5+ Family - 5+ Units Up/Down',
    count: 79,
    investmentPotential: 'high',
    cashFlowPotential: 8
  },
  {
    style: '2 Family - 2 Units Side By Side',
    count: 69,
    investmentPotential: 'high',
    cashFlowPotential: 2
  },
  {
    style: '4 Family',
    count: 58,
    investmentPotential: 'high',
    cashFlowPotential: 4
  },
  {
    style: 'Attached (Townhouse/Rowhouse/Duplex)',
    count: 609,
    investmentPotential: 'medium',
    cashFlowPotential: 2
  },
  {
    style: '4 Family - 4 Units Up/Down',
    count: 34,
    investmentPotential: 'high',
    cashFlowPotential: 4
  },
  {
    style: 'Duplex',
    count: 17,
    investmentPotential: 'high',
    cashFlowPotential: 2
  }
];

// Property type mapping for investment focus
export const PROPERTY_TYPE_INVESTMENT_MAP = {
  'Residential': 11603,           // General residential
  'Residential Income': 1346,     // Specifically income-producing
  'Land': 1357,                   // Development potential
  'Commercial Sale': 1072         // Commercial investment
};

export class InvestmentPropertyMapper {
  
  /**
   * Get optimal property styles for investment based on budget and target units
   */
  static getOptimalPropertyStyles(budget: number, targetUnits: number = 2): string[] {
    const affordableStyles = INVESTMENT_PROPERTY_STYLES
      .filter(style => {
        // Multi-family properties typically cost more per unit
        const estimatedPricePerUnit = budget <= 400000 ? 150000 : 200000;
        const maxUnits = Math.floor(budget / estimatedPricePerUnit);
        return style.cashFlowPotential <= maxUnits && style.cashFlowPotential >= targetUnits;
      })
      .sort((a, b) => {
        // Prioritize by investment potential and availability
        if (a.investmentPotential !== b.investmentPotential) {
          const potentialScore = { 'high': 3, 'medium': 2, 'low': 1 };
          return potentialScore[b.investmentPotential] - potentialScore[a.investmentPotential];
        }
        return b.count - a.count; // Higher availability
      })
      .slice(0, 5)
      .map(style => style.style);

    console.log(`💰 [Investment Mapper] For budget $${budget.toLocaleString()}, targeting ${targetUnits}+ units:`);
    console.log(`🎯 [Investment Mapper] Optimal styles: ${affordableStyles.join(', ')}`);
    
    return affordableStyles;
  }

  /**
   * Get investment potential score for a property style
   */
  static getInvestmentScore(propertyStyle: string): number {
    const style = INVESTMENT_PROPERTY_STYLES.find(s => s.style === propertyStyle);
    if (!style) return 50; // Default score
    
    const potentialScore = { 'high': 85, 'medium': 70, 'low': 55 };
    const availabilityBonus = Math.min(15, Math.floor(style.count / 100));
    
    return potentialScore[style.investmentPotential] + availabilityBonus;
  }

  /**
   * Get expected cash flow units for a property style
   */
  static getExpectedUnits(propertyStyle: string): number {
    const style = INVESTMENT_PROPERTY_STYLES.find(s => s.style === propertyStyle);
    return style ? style.cashFlowPotential : 1;
  }
}
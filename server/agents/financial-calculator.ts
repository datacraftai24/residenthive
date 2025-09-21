/**
 * Financial Calculator Agent
 * Role: Financial Analysis Expert  
 * Responsibility: Comprehensive financial modeling and scenario analysis
 */

import { configRegistry } from '../config/config-registry.js';

export interface LoanLimitValidation {
  valid: boolean;
  maxFHAPurchase: number;
  maxConventionalPurchase: number;
  reason?: string;
  county?: string;
  fhaLimit?: number;
  conformingLimit?: number;
}

export interface DTIDSCRValidation {
  valid: boolean;
  dti?: number;
  dscr?: number;
  maxAllowedDTI: number;
  minRequiredDSCR: number;
  reason?: string;
}

export interface FinancialScenario {
  scenario: string;
  downPaymentPercent: number;
  downPayment: number;
  loanAmount: number;
  monthlyPayment: number;
  monthlyCashFlow: number;
  monthlyPrincipal: number;
  monthlyAppreciation: number;
  totalEconomicBenefit: number;
  annualReturn: number;
  returnOnEquity: number;
  walkthrough: string[];
}

export interface PropertyFinancials {
  property: any;
  baseAnalysis: {
    estimatedRent: number;
    operatingExpenses: number;
    capRate: number;
  };
  scenarios: FinancialScenario[];
  recommendedScenario: FinancialScenario;
  riskFactors: string[];
}

export class FinancialCalculatorAgent {
  private interestRate = 0.07; // 7% interest rate
  private loanTerm = 30; // 30 years
  private operatingExpenseRatio = 0.35; // 35% of rent
  private appreciationRate = 0.03; // 3% annually

  /**
   * Analyze multiple properties - used by orchestrator
   */
  async analyzeFinancials(
    properties: any[], 
    capital: number, 
    targetReturn?: number
  ): Promise<any[]> {
    console.log(`💰 [Financial Calculator] Analyzing ${properties.length} properties...`);
    
    const results = [];
    for (const property of properties) {
      try {
        const analysis = await this.analyzeProperty(property, { capital, targetReturn });
        results.push({
          propertyId: property.id || property.address,
          scenarios: analysis.scenarios.map(s => ({
            scenarioName: s.name,
            downPayment: s.downPaymentAmount,
            loanAmount: s.loanAmount,
            monthlyPayment: s.monthlyPayment,
            totalMonthlyExpenses: s.totalMonthlyExpenses,
            monthlyRentalIncome: s.monthlyRentalIncome,
            monthlyCashFlow: s.monthlyCashFlow,
            annualReturn: s.returnOnEquity,
            capRate: analysis.baseAnalysis.capRate,
            cashOnCashReturn: s.cashOnCashReturn
          })),
          bestScenario: analysis.recommendedScenario.name
        });
      } catch (error) {
        console.error(`❌ Error analyzing property ${property.id}:`, error);
        results.push({
          propertyId: property.id || property.address,
          scenarios: [],
          calc_error: true,
          error_message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return results;
  }

  async analyzeProperty(property: any, investmentProfile: any): Promise<PropertyFinancials> {
    console.log(`💰 [Financial Calculator] Analyzing ${property.address || 'Property'}...`);

    // NEW: Validate loan limits first
    const loanValidation = await this.validateLoanLimits(property, investmentProfile);
    if (!loanValidation.valid) {
      console.log(`❌ Property fails loan limit validation: ${loanValidation.reason}`);
      // Still analyze but flag the issue
    }

    // Base analysis
    const baseAnalysis = this.calculateBaseAnalysis(property);
    
    // Generate multiple scenarios
    const scenarios = this.generateScenarios(property, baseAnalysis);
    
    // NEW: Validate DTI/DSCR for each scenario
    const validatedScenarios = await Promise.all(
      scenarios.map(async (scenario) => {
        const dtiDscrValidation = await this.validateDTIDSCR(
          property,
          scenario,
          investmentProfile,
          baseAnalysis.estimatedRent
        );
        return {
          ...scenario,
          dtiDscrValidation
        };
      })
    );
    
    // Determine recommended scenario (prefer valid ones)
    const recommendedScenario = this.selectRecommendedScenario(validatedScenarios, investmentProfile);
    
    // Identify risk factors
    const riskFactors = this.assessRiskFactors(property, baseAnalysis, investmentProfile);
    
    // Add loan limit warning if applicable
    if (!loanValidation.valid) {
      riskFactors.unshift(`⚠️ LOAN LIMITS: ${loanValidation.reason}`);
    }

    return {
      property,
      baseAnalysis,
      scenarios: validatedScenarios,
      recommendedScenario,
      riskFactors,
      loanValidation
    };
  }

  private calculateBaseAnalysis(property: any): any {
    // Estimate rental income based on property characteristics
    const estimatedRent = this.estimateRentalIncome(property);
    
    // Calculate operating expenses (35% rule)
    const operatingExpenses = estimatedRent * this.operatingExpenseRatio;
    
    // Calculate Net Operating Income
    const noi = estimatedRent * 12 - operatingExpenses * 12;
    
    // Calculate cap rate
    const capRate = (noi / property.price) * 100;

    return {
      estimatedRent,
      operatingExpenses,
      noi,
      capRate
    };
  }

  private estimateRentalIncome(property: any): number {
    // Rental estimates by location and bedrooms
    const rentMap: { [key: string]: { [key: number]: number } } = {
      'Boston': { 1: 2500, 2: 3200, 3: 4200, 4: 5200, 5: 6200 },
      'Cambridge': { 1: 2800, 2: 3500, 3: 4500, 4: 5500, 5: 6500 },
      'Worcester': { 1: 1400, 2: 1800, 3: 2400, 4: 2800, 5: 3200 },
      'Springfield': { 1: 1200, 2: 1500, 3: 2000, 4: 2400, 5: 2800 },
      'Lowell': { 1: 1600, 2: 2000, 3: 2600, 4: 3000, 5: 3400 },
      'Massachusetts': { 1: 1800, 2: 2200, 3: 2800, 4: 3200, 5: 3600 } // Default
    };

    const location = property.location || 'Massachusetts';
    const bedrooms = Math.min(property.bedrooms || 2, 5);
    
    let baseRent = rentMap[location]?.[bedrooms] || rentMap['Massachusetts'][bedrooms];
    
    // Adjust based on property price (proxy for area quality)
    if (property.price > 600000) baseRent *= 1.15;
    else if (property.price < 300000) baseRent *= 0.85;
    
    // Multi-family adjustment
    if (property.bedrooms >= 3 && property.propertyType?.toLowerCase().includes('multi')) {
      baseRent *= 1.2; // Multi-family typically generates more rent
    }

    return Math.round(baseRent);
  }

  private generateScenarios(property: any, baseAnalysis: any): FinancialScenario[] {
    const scenarios: FinancialScenario[] = [];
    const downPaymentOptions = [0.25, 0.30, 0.40]; // 25%, 30%, 40%

    for (const downPaymentPercent of downPaymentOptions) {
      const scenario = this.calculateScenario(property, baseAnalysis, downPaymentPercent);
      scenarios.push(scenario);
    }

    return scenarios;
  }

  private calculateScenario(property: any, baseAnalysis: any, downPaymentPercent: number): FinancialScenario {
    const price = property.price;
    const downPayment = price * downPaymentPercent;
    const loanAmount = price - downPayment;
    
    // Monthly mortgage payment
    const monthlyPayment = this.calculateMonthlyPayment(loanAmount);
    
    // Monthly principal paydown
    const monthlyPrincipal = monthlyPayment - (loanAmount * (this.interestRate / 12));
    
    // Monthly appreciation
    const monthlyAppreciation = (price * this.appreciationRate) / 12;
    
    // Monthly cash flow
    const monthlyCashFlow = baseAnalysis.estimatedRent - monthlyPayment - baseAnalysis.operatingExpenses;
    
    // Total economic benefit
    const totalEconomicBenefit = monthlyCashFlow + monthlyPrincipal + monthlyAppreciation;
    
    // Annual return and ROE
    const annualReturn = totalEconomicBenefit * 12;
    const returnOnEquity = (annualReturn / downPayment) * 100;

    // Generate walkthrough
    const walkthrough = this.generateWalkthrough({
      price, downPayment, loanAmount, monthlyPayment, 
      estimatedRent: baseAnalysis.estimatedRent,
      operatingExpenses: baseAnalysis.operatingExpenses,
      monthlyCashFlow, monthlyPrincipal, monthlyAppreciation,
      totalEconomicBenefit, returnOnEquity, downPaymentPercent
    });

    return {
      scenario: this.getScenarioName(downPaymentPercent),
      downPaymentPercent,
      downPayment,
      loanAmount,
      monthlyPayment,
      monthlyCashFlow,
      monthlyPrincipal,
      monthlyAppreciation,
      totalEconomicBenefit,
      annualReturn,
      returnOnEquity,
      walkthrough
    };
  }

  private calculateMonthlyPayment(loanAmount: number): number {
    const monthlyRate = this.interestRate / 12;
    const months = this.loanTerm * 12;
    
    return loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, months)) / 
           (Math.pow(1 + monthlyRate, months) - 1);
  }

  private getScenarioName(downPaymentPercent: number): string {
    switch (downPaymentPercent) {
      case 0.25: return "Standard Investment (25% Down)";
      case 0.30: return "Conservative Approach (30% Down)"; 
      case 0.40: return "Cash Flow Focused (40% Down)";
      default: return `${(downPaymentPercent * 100)}% Down Payment`;
    }
  }

  private generateWalkthrough(data: any): string[] {
    return [
      `Purchase Price: $${data.price.toLocaleString()}`,
      `Down Payment (${(data.downPaymentPercent * 100)}%): $${Math.round(data.downPayment).toLocaleString()}`,
      `Loan Amount: $${Math.round(data.loanAmount).toLocaleString()}`,
      `Monthly Rent: $${data.estimatedRent.toLocaleString()}`,
      `Mortgage Payment: $${Math.round(data.monthlyPayment).toLocaleString()}`,
      `Operating Expenses (35%): $${Math.round(data.operatingExpenses).toLocaleString()}`,
      `Net Cash Flow: $${Math.round(data.monthlyCashFlow).toLocaleString()}`,
      `Principal Paydown: $${Math.round(data.monthlyPrincipal).toLocaleString()}`,
      `Appreciation (3%/year): $${Math.round(data.monthlyAppreciation).toLocaleString()}`,
      `Total Monthly Benefit: $${Math.round(data.totalEconomicBenefit).toLocaleString()}`,
      `Annual ROE: ${data.returnOnEquity.toFixed(1)}%`
    ];
  }

  private selectRecommendedScenario(scenarios: FinancialScenario[], profile: any): FinancialScenario {
    // Logic to recommend best scenario based on investor profile
    
    if (profile.riskTolerance === 'conservative') {
      // Recommend scenario with positive cash flow or highest down payment
      return scenarios.find(s => s.monthlyCashFlow >= 0) || scenarios[scenarios.length - 1];
    }
    
    if (profile.preferences?.passiveIncome && profile.preferences.passiveIncome > 2000) {
      // Recommend scenario with highest total economic benefit
      return scenarios.reduce((best, current) => 
        current.totalEconomicBenefit > best.totalEconomicBenefit ? current : best
      );
    }
    
    // Default: best ROE scenario
    return scenarios.reduce((best, current) => 
      current.returnOnEquity > best.returnOnEquity ? current : best
    );
  }

  private assessRiskFactors(property: any, baseAnalysis: any, profile: any): string[] {
    const risks: string[] = [];
    
    if (baseAnalysis.capRate < 4.0) {
      risks.push("Low cap rate indicates potential overvaluation");
    }
    
    if (property.price > profile.capital * 4) {
      risks.push("High leverage ratio increases financial risk");
    }
    
    const cashFlowScenario = this.calculateScenario(property, baseAnalysis, 0.25);
    if (cashFlowScenario.monthlyCashFlow < -500) {
      risks.push("Significant negative cash flow requires strong appreciation");
    }
    
    if (property.propertyType?.toLowerCase().includes('condo')) {
      risks.push("Condo fees and HOA restrictions may impact returns");
    }
    
    return risks;
  }

  async batchAnalyzeProperties(properties: any[], investmentProfile: any): Promise<PropertyFinancials[]> {
    console.log(`💰 [Financial Calculator] Batch analyzing ${properties.length} properties...`);
    
    const analyses: PropertyFinancials[] = [];
    
    for (const property of properties) {
      try {
        const analysis = await this.analyzeProperty(property, investmentProfile);
        analyses.push(analysis);
      } catch (error) {
        console.error(`❌ [Financial Calculator] Error analyzing property ${property.address}:`, error);
      }
    }
    
    // Sort by recommended scenario's total economic benefit
    return analyses.sort((a, b) => 
      b.recommendedScenario.totalEconomicBenefit - a.recommendedScenario.totalEconomicBenefit
    );
  }
}
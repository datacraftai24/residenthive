/**
 * Property Evaluator Clean
 * Purpose: Final investment DECISION maker (not evaluator!)
 * 
 * This agent:
 * - Does NOT evaluate properties (that's done by comprehensive evaluator)
 * - Makes the final DECISION on which strategy wins
 * - Selects top properties from the winning strategy
 * - Properties come with comprehensiveEvaluation already done
 */

interface InvestmentDecision {
  winningStrategy: {
    name: string;
    score: number;
    rationale: string;
  };
  topProperties: Array<{
    address: string;
    price: number;
    strategy: string;
    cashFlow: number;
    capRate: number;
    recommendation: 'BUY' | 'CONSIDER' | 'PASS';
    reasoning: string;
  }>;
  metrics: {
    totalPropertiesEvaluated: number;
    viableProperties: number;
    averageCashFlow: number;
    averageCapRate: number;
  };
  nextSteps: string[];
}

class PropertyEvaluatorClean {
  /**
   * Make final investment DECISION based on already-evaluated properties
   * Properties already have comprehensiveEvaluation from the two-phase evaluator
   */
  async evaluateAndDecide(
    properties: any[],
    strategies: any[],
    researchResults: any[],
    requirements: any
  ): Promise<InvestmentDecision> {
    console.log(`\n🎯 [Property Evaluator Clean] Making final investment DECISION...`);
    console.log(`   📊 Pre-evaluated properties: ${properties.length}`);
    console.log(`   📋 Strategies to compare: ${strategies.length}`);
    
    const monthlyTarget = requirements.monthlyIncomeTarget || requirements.budget?.monthlyTarget || 0;
    
    // Group already-evaluated properties by strategy
    const strategyPerformance = new Map<string, {
      strategy: any;
      qualifiedProperties: any[];
      totalProperties: number;
      avgCashFlow: number;
      avgCapRate: number;
      avgScore: number;
      meetsGoal: boolean;
    }>();
    
    // Analyze each property's comprehensive evaluation
    properties.forEach(prop => {
      const strategyName = prop.strategy || prop.strategyDetails?.name || 'Unknown';
      
      if (!strategyPerformance.has(strategyName)) {
        const strategy = strategies.find(s => s.name === strategyName) || { name: strategyName };
        strategyPerformance.set(strategyName, {
          strategy,
          qualifiedProperties: [],
          totalProperties: 0,
          avgCashFlow: 0,
          avgCapRate: 0,
          avgScore: 0,
          meetsGoal: false
        });
      }
      
      const perf = strategyPerformance.get(strategyName)!;
      perf.totalProperties++;
      
      // Only count properties that passed comprehensive evaluation
      if (prop.comprehensiveEvaluation) {
        const evalResult = prop.comprehensiveEvaluation;
        // Property qualified if it has a score or passed phase 1
        if (evalResult.score > 0 || evalResult.uw?.phase1_pass) {
          perf.qualifiedProperties.push(prop);
          perf.avgCashFlow += evalResult.uw?.cash_flow || 0;
          perf.avgCapRate += evalResult.uw?.cap_rate || 0;
          perf.avgScore += evalResult.score || 70; // Default score for phase1-only passes
        }
      }
    });
    
    // Calculate averages and determine winner
    let bestStrategy: any = null;
    let bestScore = -1;
    
    strategyPerformance.forEach((perf, strategyName) => {
      if (perf.qualifiedProperties.length === 0) {
        console.log(`   ❌ ${strategyName}: No qualified properties`);
        return;
      }
      
      // Calculate averages
      const count = perf.qualifiedProperties.length;
      perf.avgCashFlow /= count;
      perf.avgCapRate /= count;
      perf.avgScore /= count;
      perf.meetsGoal = perf.avgCashFlow >= monthlyTarget;
      
      // Calculate strategy score
      let score = 0;
      
      // Primary factor: Meeting income goal (40 points)
      if (perf.meetsGoal) {
        score += 40;
      } else {
        score += (perf.avgCashFlow / monthlyTarget) * 30; // Partial credit
      }
      
      // Number of viable options (30 points)
      score += Math.min(30, count * 5); // 5 points per property, max 30
      
      // Quality of properties (20 points)
      score += (perf.avgScore / 100) * 20;
      
      // Cap rate performance (10 points)
      score += Math.min(10, perf.avgCapRate * 100); // 10% cap = 10 points
      
      console.log(`   📊 ${strategyName}:`);
      console.log(`      Qualified: ${count}/${perf.totalProperties}`);
      console.log(`      Avg Cash Flow: $${perf.avgCashFlow.toFixed(0)}/mo`);
      console.log(`      Avg Cap Rate: ${(perf.avgCapRate * 100).toFixed(2)}%`);
      console.log(`      Score: ${score.toFixed(1)}/100`);
      
      if (score > bestScore) {
        bestScore = score;
        bestStrategy = {
          name: strategyName,
          score,
          performance: perf
        };
      }
    });
    
    // No viable strategy
    if (!bestStrategy) {
      return {
        winningStrategy: {
          name: 'No Viable Strategy',
          score: 0,
          rationale: 'No strategies produced qualified properties after comprehensive evaluation'
        },
        topProperties: [],
        metrics: {
          totalPropertiesEvaluated: properties.length,
          viableProperties: 0,
          averageCashFlow: 0,
          averageCapRate: 0
        },
        nextSteps: [
          'Expand search criteria',
          'Increase budget',
          'Consider different markets'
        ]
      };
    }
    
    console.log(`\n   🏆 WINNER: ${bestStrategy.name} (Score: ${bestStrategy.score.toFixed(1)}/100)`);
    
    // Get top 5 properties from winning strategy
    const topProperties = bestStrategy.performance.qualifiedProperties
      .sort((a: any, b: any) => {
        const scoreA = a.comprehensiveEvaluation?.score || 0;
        const scoreB = b.comprehensiveEvaluation?.score || 0;
        return scoreB - scoreA;
      })
      .slice(0, 5)
      .map((p: any) => ({
        address: p.address || p.fullAddress || 'Unknown',
        price: p.price,
        strategy: bestStrategy.name,
        cashFlow: p.comprehensiveEvaluation?.uw?.cash_flow || 0,
        capRate: (p.comprehensiveEvaluation?.uw?.cap_rate || 0) * 100,
        recommendation: this.getRecommendation(p.comprehensiveEvaluation?.score || 0),
        reasoning: p.comprehensiveEvaluation?.llm_narrative || 
                   'Passed deterministic screening'
      }));
    
    const perf = bestStrategy.performance;
    return {
      winningStrategy: {
        name: bestStrategy.name,
        score: bestStrategy.score,
        rationale: `Achieves $${perf.avgCashFlow.toFixed(0)}/mo (${
          perf.meetsGoal ? 'exceeds' : 'approaches'
        } $${monthlyTarget}/mo goal) with ${perf.qualifiedProperties.length} viable properties`
      },
      topProperties,
      metrics: {
        totalPropertiesEvaluated: properties.length,
        viableProperties: perf.qualifiedProperties.length,
        averageCashFlow: perf.avgCashFlow,
        averageCapRate: perf.avgCapRate * 100
      },
      nextSteps: [
        'Schedule property viewings for top recommendations',
        'Get pre-approved for financing',
        'Conduct professional inspections',
        'Prepare competitive offers'
      ]
    };
  }
  
  private getRecommendation(score: number): 'BUY' | 'CONSIDER' | 'PASS' {
    if (score >= 85) return 'BUY';
    if (score >= 70) return 'CONSIDER';
    return 'PASS';
  }
}

export const propertyEvaluatorClean = new PropertyEvaluatorClean();
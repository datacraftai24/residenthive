/**
 * Config Updater Service
 * 
 * Allows AI agents to update configuration values based on their research
 * with proper validation and confidence tracking
 */

import { configRegistry, ConfigKey } from '../config/config-registry.js';
import { tracedLLMCall } from '../observability/llm-tracer.js';

export interface ConfigUpdateRequest {
  key: ConfigKey;
  value: any;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  source: string;
  researchQuery?: string;
  rawData?: string;
}

export class ConfigUpdaterService {
  /**
   * Market Discovery Agent can update market data based on research
   */
  async updateMarketDataFromResearch(
    agentName: string,
    researchFindings: any[]
  ): Promise<void> {
    console.log(`🔄 [ConfigUpdater] Processing research findings for config updates`);
    
    // Extract mortgage rates if found
    const mortgageRateFindings = researchFindings.filter(f => 
      f.data?.toLowerCase().includes('mortgage rate') ||
      f.data?.toLowerCase().includes('interest rate')
    );
    
    if (mortgageRateFindings.length > 0) {
      const rateUpdate = await this.extractMortgageRates(mortgageRateFindings);
      if (rateUpdate) {
        await this.updateMortgageRates(agentName, rateUpdate);
      }
    }
    
    // Extract property tax rates if found
    const taxRateFindings = researchFindings.filter(f =>
      f.data?.toLowerCase().includes('property tax') ||
      f.data?.toLowerCase().includes('tax rate')
    );
    
    if (taxRateFindings.length > 0) {
      const taxUpdates = await this.extractPropertyTaxRates(taxRateFindings);
      if (taxUpdates.length > 0) {
        await this.updatePropertyTaxRates(agentName, taxUpdates);
      }
    }
  }
  
  /**
   * Extract mortgage rates from research using LLM
   */
  private async extractMortgageRates(findings: any[]): Promise<any | null> {
    const prompt = `Extract current mortgage rates from this research data.
    
Research findings:
${findings.map(f => `- ${f.data}`).join('\n')}

Extract the most recent rates you can find. Return JSON:
{
  "conventional30": <number or null>,
  "conventional15": <number or null>,
  "fha30": <number or null>,
  "va30": <number or null>,
  "jumbo30": <number or null>,
  "source": "source of the data",
  "date": "date of the rates",
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}

If no rates found, return null.`;

    try {
      const response = await tracedLLMCall(
        'config_updater',
        {
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You extract structured data from research findings.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }
      );
      
      const extracted = JSON.parse(response.choices[0].message.content || 'null');
      
      // Filter out null values and validate
      if (extracted && extracted.conventional30) {
        return extracted;
      }
    } catch (error) {
      console.error('Failed to extract mortgage rates:', error);
    }
    
    return null;
  }
  
  /**
   * Update mortgage rates in config
   */
  private async updateMortgageRates(
    agentName: string,
    rateData: any
  ): Promise<void> {
    try {
      // Get current config
      const currentConfig = await configRegistry.getValue('market-data', {});
      
      // Merge new rates with existing
      const updatedRates = {
        ...currentConfig.mortgageRates,
        conventional30: rateData.conventional30 || currentConfig.mortgageRates?.conventional30,
        conventional15: rateData.conventional15 || currentConfig.mortgageRates?.conventional15,
        fha30: rateData.fha30 || currentConfig.mortgageRates?.fha30,
        va30: rateData.va30 || currentConfig.mortgageRates?.va30,
        jumbo30: rateData.jumbo30 || currentConfig.mortgageRates?.jumbo30,
        updatedAt: new Date().toISOString(),
        source: rateData.source,
        confidence: rateData.confidence
      };
      
      // Update config with TTL based on confidence
      const ttl = rateData.confidence === 'HIGH' ? 7 * 24 * 3600 : 3 * 24 * 3600; // 7 days or 3 days
      
      await configRegistry.updateValue(
        'market-data',
        {
          ...currentConfig,
          mortgageRates: updatedRates
        },
        agentName,
        {
          ttl,
          provenance: {
            source: 'agent',
            agent: agentName,
            researchQuery: 'current mortgage rates',
            confidence: rateData.confidence
          }
        }
      );
      
      console.log(`✅ Updated mortgage rates from ${rateData.source} (${rateData.confidence} confidence)`);
    } catch (error) {
      console.error('Failed to update mortgage rates:', error);
    }
  }
  
  /**
   * Extract property tax rates from research
   */
  private async extractPropertyTaxRates(findings: any[]): Promise<any[]> {
    const prompt = `Extract property tax rates by city from this research data.
    
Research findings:
${findings.map(f => `- ${f.data}`).join('\n')}

Extract tax rates for specific cities. Return JSON array:
[
  {
    "city": "City Name",
    "rate": <number between 0 and 0.1>,
    "effectiveDate": "date if known",
    "source": "source of the data"
  }
]

Only include cities with specific rates mentioned. Return empty array if none found.`;

    try {
      const response = await tracedLLMCall(
        'config_updater',
        {
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You extract structured data from research findings.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }
      );
      
      const result = JSON.parse(response.choices[0].message.content || '{"rates":[]}');
      return result.rates || [];
    } catch (error) {
      console.error('Failed to extract property tax rates:', error);
      return [];
    }
  }
  
  /**
   * Update property tax rates in config
   */
  private async updatePropertyTaxRates(
    agentName: string,
    taxRates: any[]
  ): Promise<void> {
    try {
      // Get current config
      const currentConfig = await configRegistry.getValue('market-data', {});
      const currentTaxRates = currentConfig.propertyTaxRates || {};
      
      // Merge new rates
      const updatedTaxRates = { ...currentTaxRates };
      
      for (const rate of taxRates) {
        if (rate.city && rate.rate) {
          updatedTaxRates[rate.city] = {
            rate: rate.rate,
            effectiveDate: rate.effectiveDate || new Date().toISOString().split('T')[0],
            source: rate.source || 'research'
          };
        }
      }
      
      // Update config
      await configRegistry.updateValue(
        'market-data',
        {
          ...currentConfig,
          propertyTaxRates: updatedTaxRates
        },
        agentName,
        {
          ttl: 30 * 24 * 3600, // 30 days for tax rates
          provenance: {
            source: 'agent',
            agent: agentName,
            researchQuery: 'property tax rates',
            confidence: 'MEDIUM'
          }
        }
      );
      
      console.log(`✅ Updated ${taxRates.length} property tax rates`);
    } catch (error) {
      console.error('Failed to update property tax rates:', error);
    }
  }
  
  /**
   * Data Reconciliation Agent can update source weights based on accuracy
   */
  async updateSourceWeightsFromAccuracy(
    agentName: string,
    accuracyData: Array<{
      source: string;
      accuracy: number;
      sampleSize: number;
    }>
  ): Promise<void> {
    try {
      const currentConfig = await configRegistry.getValue('source-weights', {});
      const currentWeights = currentConfig.weights || {};
      
      // Calculate new weights based on accuracy
      const updatedWeights = { ...currentWeights };
      
      for (const data of accuracyData) {
        if (data.sampleSize < 5) continue; // Need sufficient samples
        
        const currentWeight = currentWeights[data.source] || 0.5;
        const adjustment = (data.accuracy - 0.7) * 0.2; // ±0.2 max adjustment
        const newWeight = Math.max(0.1, Math.min(1.0, currentWeight + adjustment));
        
        updatedWeights[data.source] = Math.round(newWeight * 100) / 100;
      }
      
      // Update config
      await configRegistry.updateValue(
        'source-weights',
        {
          ...currentConfig,
          weights: updatedWeights
        },
        agentName,
        {
          provenance: {
            source: 'agent',
            agent: agentName,
            confidence: 'HIGH'
          }
        }
      );
      
      console.log(`✅ Updated source weights based on accuracy data`);
    } catch (error) {
      console.error('Failed to update source weights:', error);
    }
  }
  
  /**
   * Update metric tolerances based on observed variance
   */
  async updateMetricTolerancesFromObservations(
    agentName: string,
    observations: Array<{
      metric: string;
      observedVariance: number;
      sampleSize: number;
    }>
  ): Promise<void> {
    try {
      const currentConfig = await configRegistry.getValue('reconciliation', {});
      const currentTolerances = currentConfig.metricTolerances || {};
      
      // Update tolerances based on observations
      const updatedTolerances = { ...currentTolerances };
      
      for (const obs of observations) {
        if (obs.sampleSize < 10) continue; // Need sufficient samples
        
        const current = currentTolerances[obs.metric];
        if (current) {
          // Adjust tolerance to match observed variance (with buffer)
          const newTolerance = Math.min(0.5, obs.observedVariance * 1.2);
          
          updatedTolerances[obs.metric] = {
            ...current,
            tolerance: Math.round(newTolerance * 100) / 100
          };
        }
      }
      
      // Update config
      await configRegistry.updateValue(
        'reconciliation',
        {
          ...currentConfig,
          metricTolerances: updatedTolerances
        },
        agentName,
        {
          provenance: {
            source: 'agent',
            agent: agentName,
            confidence: 'MEDIUM'
          }
        }
      );
      
      console.log(`✅ Updated metric tolerances based on observations`);
    } catch (error) {
      console.error('Failed to update metric tolerances:', error);
    }
  }
}

// Export singleton instance
export const configUpdater = new ConfigUpdaterService();
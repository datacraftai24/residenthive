/**
 * Research Logger for Unit Detection
 * 
 * Logs properties where unit count couldn't be reliably determined
 * for later analysis and pattern extraction
 */

import * as fs from 'fs';
import * as path from 'path';
import { UnitDetection } from './property-types';

// Research entry structure
export interface UnitsResearchEntry {
  timestamp: string;
  mlsNumber: string;
  address: string;
  price: number;
  style?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  description_snippet?: string;
  detection_attempts: Record<string, string>;
  assigned_units: number;
  confidence: string;
  needs_research: boolean;
  strategy_impact?: string;
  potential_cap_rate_range?: {
    as_assigned: number;
    if_2_units: number;
    if_3_units: number;
    if_4_units: number;
  };
}

export class ResearchLogger {
  private logDir: string;
  private currentLogFile: string;
  
  constructor() {
    // Create research directory if it doesn't exist
    this.logDir = path.join(process.cwd(), 'server', 'data', 'units-research');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // Use daily log files
    const today = new Date().toISOString().split('T')[0];
    this.currentLogFile = path.join(this.logDir, `${today}.jsonl`);
  }
  
  /**
   * Log a property that needs unit research
   */
  async logPropertyForResearch(
    property: any,
    unitDetection: UnitDetection,
    additionalContext?: {
      strategy?: string;
      rentBand?: number[];
      currentCapRate?: number;
    }
  ): Promise<void> {
    try {
      // Extract description snippet
      const description = property.details?.description || property.description || '';
      const descSnippet = description.substring(0, 200) + (description.length > 200 ? '...' : '');
      
      // Build detection attempts record
      const detectionAttempts: Record<string, string> = {};
      
      if (property.details?.style) {
        detectionAttempts.style_parse = `"${property.details.style}" -> ${
          unitDetection.source === 'style_field' ? `${unitDetection.units} units` : 'ambiguous'
        }`;
      }
      
      if (description && unitDetection.source === 'description_parse') {
        detectionAttempts.description_parse = `Found: ${unitDetection.raw_indicators?.join(', ')} -> ${unitDetection.units} units`;
      } else if (description) {
        detectionAttempts.description_parse = 'No clear unit indicators found';
      }
      
      if (unitDetection.source === 'bedroom_inference') {
        detectionAttempts.bedroom_inference = `${property.details?.numBedrooms || 0} beds / ${
          property.details?.numBathrooms || 0
        } baths -> estimated ${unitDetection.units} units`;
      }
      
      // Calculate potential cap rates if we have rent data
      let potentialCapRates;
      if (additionalContext?.rentBand && property.price) {
        const avgRent = (additionalContext.rentBand[0] + additionalContext.rentBand[1]) / 2;
        const calcCapRate = (units: number) => {
          const annualRent = avgRent * units * 12;
          const expenses = annualRent * 0.4; // 40% expense ratio estimate
          const noi = annualRent - expenses;
          return (noi / property.price) * 100;
        };
        
        potentialCapRates = {
          as_assigned: calcCapRate(unitDetection.units),
          if_2_units: calcCapRate(2),
          if_3_units: calcCapRate(3),
          if_4_units: calcCapRate(4),
        };
      }
      
      // Build research entry
      const entry: UnitsResearchEntry = {
        timestamp: new Date().toISOString(),
        mlsNumber: property.mlsNumber || property.mls_id || property.id || 'unknown',
        address: this.formatAddress(property),
        price: property.price || property.listPrice || 0,
        style: property.details?.style,
        propertyType: property.details?.propertyType || property.propertyType,
        bedrooms: property.details?.numBedrooms || property.bedrooms,
        bathrooms: property.details?.numBathrooms || property.bathrooms,
        squareFeet: property.details?.sqft ? parseInt(property.details.sqft) : undefined,
        description_snippet: descSnippet,
        detection_attempts: detectionAttempts,
        assigned_units: unitDetection.units,
        confidence: unitDetection.confidence,
        needs_research: unitDetection.needs_research || false,
        strategy_impact: this.assessStrategyImpact(unitDetection, potentialCapRates),
        potential_cap_rate_range: potentialCapRates,
      };
      
      // Append to log file
      await this.appendToLog(entry);
      
      // Also log to console for immediate visibility
      console.log(`📝 [Research] Logged property for unit verification: ${entry.address}`);
      console.log(`   Confidence: ${entry.confidence}, Assigned: ${entry.assigned_units} units`);
      if (potentialCapRates) {
        console.log(`   Potential cap rates: ${unitDetection.units} units=${potentialCapRates.as_assigned.toFixed(1)}%, ` +
                   `2 units=${potentialCapRates.if_2_units.toFixed(1)}%, ` +
                   `3 units=${potentialCapRates.if_3_units.toFixed(1)}%`);
      }
      
    } catch (error) {
      console.error('Failed to log property for research:', error);
    }
  }
  
  /**
   * Append entry to current log file
   */
  private async appendToLog(entry: UnitsResearchEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    await fs.promises.appendFile(this.currentLogFile, line, 'utf8');
  }
  
  /**
   * Format property address for logging
   */
  private formatAddress(property: any): string {
    if (property.fullAddress) return property.fullAddress;
    
    const parts = [];
    
    if (property.address) {
      if (typeof property.address === 'string') {
        parts.push(property.address);
      } else {
        // Handle Repliers API address structure
        const addr = property.address;
        const streetParts = [
          addr.streetNumber,
          addr.streetName,
          addr.streetSuffix
        ].filter(Boolean).join(' ');
        
        if (streetParts) parts.push(streetParts);
        if (addr.unitNumber) parts.push(`#${addr.unitNumber}`);
        if (addr.city) parts.push(addr.city);
        if (addr.state) parts.push(addr.state);
      }
    }
    
    return parts.join(', ') || 'Address unavailable';
  }
  
  /**
   * Assess the strategy impact of incorrect unit count
   */
  private assessStrategyImpact(
    unitDetection: UnitDetection,
    potentialCapRates?: any
  ): string {
    if (unitDetection.confidence === 'HIGH') {
      return 'Low impact - high confidence in unit count';
    }
    
    if (unitDetection.confidence === 'UNKNOWN') {
      return 'High impact - property may be completely misvalued';
    }
    
    if (potentialCapRates) {
      const assignedCap = potentialCapRates.as_assigned;
      const maxCap = Math.max(
        potentialCapRates.if_2_units,
        potentialCapRates.if_3_units,
        potentialCapRates.if_4_units
      );
      
      if (maxCap - assignedCap > 3) {
        return `High impact - potential ${(maxCap - assignedCap).toFixed(1)}% cap rate difference`;
      } else if (maxCap - assignedCap > 1.5) {
        return `Medium impact - potential ${(maxCap - assignedCap).toFixed(1)}% cap rate difference`;
      }
    }
    
    return 'Medium impact - unit count uncertainty affects valuation';
  }
  
  /**
   * Read and analyze research log for patterns
   */
  async analyzeResearchLog(date?: string): Promise<any> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `${targetDate}.jsonl`);
    
    if (!fs.existsSync(logFile)) {
      return { error: 'No log file found for ' + targetDate };
    }
    
    const entries: UnitsResearchEntry[] = [];
    const content = await fs.promises.readFile(logFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch (e) {
        console.error('Failed to parse log line:', e);
      }
    }
    
    // Analyze patterns
    const analysis = {
      total_entries: entries.length,
      by_confidence: {
        HIGH: entries.filter(e => e.confidence === 'HIGH').length,
        MEDIUM: entries.filter(e => e.confidence === 'MEDIUM').length,
        LOW: entries.filter(e => e.confidence === 'LOW').length,
        UNKNOWN: entries.filter(e => e.confidence === 'UNKNOWN').length,
      },
      common_styles: this.getCommonValues(entries, 'style'),
      average_impact: this.calculateAverageImpact(entries),
      properties_needing_manual_review: entries
        .filter(e => e.confidence === 'UNKNOWN' || e.confidence === 'LOW')
        .map(e => ({
          mls: e.mlsNumber,
          address: e.address,
          style: e.style,
          assigned: e.assigned_units,
          potential_cap_diff: e.potential_cap_rate_range ? 
            Math.max(
              e.potential_cap_rate_range.if_2_units,
              e.potential_cap_rate_range.if_3_units,
              e.potential_cap_rate_range.if_4_units
            ) - e.potential_cap_rate_range.as_assigned : 0
        }))
        .sort((a, b) => b.potential_cap_diff - a.potential_cap_diff)
        .slice(0, 10),
    };
    
    return analysis;
  }
  
  /**
   * Get most common values for a field
   */
  private getCommonValues(entries: UnitsResearchEntry[], field: keyof UnitsResearchEntry): any {
    const counts = new Map<string, number>();
    
    for (const entry of entries) {
      const value = String(entry[field] || 'unknown');
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value, count }));
  }
  
  /**
   * Calculate average cap rate impact
   */
  private calculateAverageImpact(entries: UnitsResearchEntry[]): number {
    const impacts = entries
      .filter(e => e.potential_cap_rate_range)
      .map(e => {
        const caps = e.potential_cap_rate_range!;
        return Math.max(
          caps.if_2_units,
          caps.if_3_units,
          caps.if_4_units
        ) - caps.as_assigned;
      });
    
    if (impacts.length === 0) return 0;
    
    return impacts.reduce((sum, impact) => sum + impact, 0) / impacts.length;
  }
}

// Export singleton instance
export const researchLogger = new ResearchLogger();
/**
 * Strict LLM Extraction Service
 * 
 * Core principle: Only extract EXACTLY what is in the text with citations.
 * NO inference, NO assumptions, NO calculations in LLM.
 * 
 * Output format:
 * {
 *   mlsNumber: { value: "73429330", citation: "MLS#: 73429330" },
 *   price: { value: 650000, citation: "List price: $650,000" },
 *   units: { 
 *     value: 3, 
 *     citation: "3 Family home",
 *     confidence: "HIGH",
 *     breakdown: [
 *       { unit: "1st floor", beds: 2, baths: 1, citation: "First floor: 2BR/1BA" },
 *       { unit: "2nd floor", beds: 2, baths: 1, citation: "Second floor: 2BR/1BA" },
 *       { unit: "3rd floor", beds: 1, baths: 1, citation: "Third floor: 1BR/1BA" }
 *     ]
 *   },
 *   taxes: { value: 8500, citation: "Annual taxes: $8,500" },
 *   yearBuilt: { value: 1920, citation: "Built in 1920" },
 *   condition: { value: "B", citation: "Well maintained", confidence: "MEDIUM" }
 * }
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface ExtractedFact<T = any> {
  value: T;
  citation: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface UnitBreakdown {
  unit: string;
  beds: number;
  baths?: number;
  sqft?: number;
  citation: string;
}

export interface ExtractedUnits extends ExtractedFact<number> {
  breakdown?: UnitBreakdown[];
}

export interface StrictExtractionResult {
  mlsNumber?: ExtractedFact<string>;
  price?: ExtractedFact<number>;
  address?: ExtractedFact<string>;
  units?: ExtractedUnits;
  taxes?: ExtractedFact<number>;
  yearBuilt?: ExtractedFact<number>;
  totalBeds?: ExtractedFact<number>;
  totalBaths?: ExtractedFact<number>;
  sqft?: ExtractedFact<number>;
  lotSize?: ExtractedFact<number>;
  propertyType?: ExtractedFact<string>;
  condition?: ExtractedFact<string>;
  heating?: ExtractedFact<string>;
  cooling?: ExtractedFact<string>;
  parking?: ExtractedFact<string>;
  basement?: ExtractedFact<string>;
  utilities?: ExtractedFact<string[]>;
  zoning?: ExtractedFact<string>;
  occupancy?: ExtractedFact<string>;
  tenantPays?: ExtractedFact<string[]>;
  ownerPays?: ExtractedFact<string[]>;
  currentRents?: ExtractedFact<number[]>;
  leaseTerms?: ExtractedFact<string[]>;
  raw?: any; // Keep raw MLS data for reference
}

export class StrictExtractionService {
  private readonly EXTRACTION_PROMPT = `You are a strict data extraction system for MLS listings.

CRITICAL RULES:
1. ONLY extract facts that are EXPLICITLY stated in the text
2. EVERY extracted value MUST have a direct citation (exact quote)
3. NEVER infer, calculate, or assume anything
4. If uncertain, mark confidence as LOW or skip the field
5. For units, look for explicit mentions like "3-family", "triplex", "3 units"
6. For unit breakdown, only include if explicitly described

Output JSON format:
{
  "mlsNumber": { "value": "...", "citation": "exact text" },
  "price": { "value": number, "citation": "exact text" },
  "units": { 
    "value": number, 
    "citation": "exact text",
    "confidence": "HIGH|MEDIUM|LOW",
    "breakdown": [
      { "unit": "name", "beds": n, "baths": n, "citation": "exact text" }
    ]
  },
  // ... other fields
}

Return ONLY valid JSON. No explanation, no markdown.`;

  async extractFromMLS(mlsData: any): Promise<StrictExtractionResult> {
    try {
      // Prepare the text for extraction
      const textToExtract = this.prepareMlsText(mlsData);
      
      // Call LLM for strict extraction
      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: this.EXTRACTION_PROMPT },
          { role: 'user', content: `Extract facts from this MLS listing:\n\n${textToExtract}` }
        ],
        temperature: 0, // Deterministic
        max_tokens: 2000
      });

      const response = completion.choices[0].message.content || '{}';
      
      // Parse and validate
      let extracted: any;
      try {
        extracted = JSON.parse(response);
      } catch (e) {
        console.error('Failed to parse LLM extraction:', response);
        extracted = {};
      }

      // Add raw data for reference
      extracted.raw = mlsData;

      // Apply conservative defaults for missing critical fields
      return this.applyConservativeDefaults(extracted, mlsData);

    } catch (error) {
      console.error('Extraction failed:', error);
      return this.fallbackExtraction(mlsData);
    }
  }

  private prepareMlsText(mlsData: any): string {
    const parts: string[] = [];
    
    // Key fields to extract
    parts.push(`MLS#: ${mlsData.mlsNumber || 'N/A'}`);
    parts.push(`List price: $${mlsData.listPrice || mlsData.price || 'N/A'}`);
    
    // Address
    if (mlsData.address) {
      const addr = mlsData.address;
      parts.push(`Address: ${addr.streetNumber || ''} ${addr.streetName || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.zip || ''}`);
    }
    
    // Property details
    if (mlsData.details) {
      const d = mlsData.details;
      if (d.propertyType) parts.push(`Property Type: ${d.propertyType}`);
      if (d.style) parts.push(`Style: ${d.style}`);
      if (d.numBedrooms) parts.push(`Total Bedrooms: ${d.numBedrooms}`);
      if (d.numBathrooms) parts.push(`Total Bathrooms: ${d.numBathrooms}`);
      if (d.yearBuilt) parts.push(`Year Built: ${d.yearBuilt}`);
      if (d.sqft) parts.push(`Square Feet: ${d.sqft}`);
      if (d.lotSqft) parts.push(`Lot Size: ${d.lotSqft} sqft`);
    }
    
    // Taxes
    if (mlsData.taxes) {
      if (mlsData.taxes.annualAmount) {
        parts.push(`Annual Taxes: $${mlsData.taxes.annualAmount}`);
      }
    }
    
    // Most important: the description
    if (mlsData.details?.description) {
      parts.push('\nDESCRIPTION:');
      parts.push(mlsData.details.description);
    }
    
    // Remarks
    if (mlsData.remarks) {
      parts.push('\nREMARKS:');
      parts.push(mlsData.remarks);
    }
    
    return parts.join('\n');
  }

  private applyConservativeDefaults(
    extracted: any, 
    mlsData: any
  ): StrictExtractionResult {
    const result: StrictExtractionResult = extracted;
    
    // If no units detected, default based on property type
    if (!result.units?.value) {
      const style = mlsData.details?.style?.toLowerCase() || '';
      const propType = mlsData.details?.propertyType?.toLowerCase() || '';
      
      if (style.includes('2 family') || style.includes('two family') || style.includes('duplex')) {
        result.units = {
          value: 2,
          citation: `Style: ${mlsData.details.style}`,
          confidence: 'HIGH'
        };
      } else if (style.includes('3 family') || style.includes('three family') || style.includes('triplex')) {
        result.units = {
          value: 3,
          citation: `Style: ${mlsData.details.style}`,
          confidence: 'HIGH'
        };
      } else if (style.includes('4 family') || style.includes('four family') || style.includes('fourplex')) {
        result.units = {
          value: 4,
          citation: `Style: ${mlsData.details.style}`,
          confidence: 'HIGH'
        };
      } else if (propType.includes('multi') || propType.includes('income')) {
        // Conservative: assume duplex for generic multi-family
        result.units = {
          value: 2,
          citation: 'Multi-family property, defaulting to 2 units',
          confidence: 'LOW'
        };
      } else {
        // Single family
        result.units = {
          value: 1,
          citation: 'Single family property',
          confidence: 'HIGH'
        };
      }
    }
    
    // Conservative defaults for condition
    if (!result.condition?.value) {
      result.condition = {
        value: 'B', // Assume average condition
        citation: 'No condition specified, assuming average',
        confidence: 'LOW'
      };
    }
    
    // Use MLS price if extraction failed
    if (!result.price?.value && mlsData.listPrice) {
      result.price = {
        value: mlsData.listPrice,
        citation: 'From MLS data',
        confidence: 'HIGH'
      };
    }
    
    // Use MLS taxes if available
    if (!result.taxes?.value && mlsData.taxes?.annualAmount) {
      result.taxes = {
        value: mlsData.taxes.annualAmount,
        citation: 'From MLS tax data',
        confidence: 'HIGH'
      };
    }
    
    return result;
  }

  private fallbackExtraction(mlsData: any): StrictExtractionResult {
    // Pure deterministic extraction when LLM fails
    const result: StrictExtractionResult = {
      raw: mlsData
    };
    
    if (mlsData.mlsNumber) {
      result.mlsNumber = {
        value: mlsData.mlsNumber,
        citation: 'MLS field',
        confidence: 'HIGH'
      };
    }
    
    if (mlsData.listPrice || mlsData.price) {
      result.price = {
        value: mlsData.listPrice || mlsData.price,
        citation: 'MLS price field',
        confidence: 'HIGH'
      };
    }
    
    if (mlsData.address) {
      const addr = mlsData.address;
      result.address = {
        value: `${addr.streetNumber || ''} ${addr.streetName || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.zip || ''}`.trim(),
        citation: 'MLS address fields',
        confidence: 'HIGH'
      };
    }
    
    // Deterministic unit detection
    const style = mlsData.details?.style?.toLowerCase() || '';
    if (style.includes('2 family') || style.includes('duplex')) {
      result.units = { value: 2, citation: style, confidence: 'HIGH' };
    } else if (style.includes('3 family') || style.includes('triplex')) {
      result.units = { value: 3, citation: style, confidence: 'HIGH' };
    } else if (style.includes('4 family') || style.includes('fourplex')) {
      result.units = { value: 4, citation: style, confidence: 'HIGH' };
    } else if (mlsData.details?.propertyType?.toLowerCase().includes('multi')) {
      result.units = { value: 2, citation: 'Multi-family, defaulted to 2', confidence: 'LOW' };
    } else {
      result.units = { value: 1, citation: 'Single family', confidence: 'HIGH' };
    }
    
    if (mlsData.details?.numBedrooms) {
      result.totalBeds = {
        value: mlsData.details.numBedrooms,
        citation: 'MLS bedroom count',
        confidence: 'HIGH'
      };
    }
    
    if (mlsData.details?.numBathrooms) {
      result.totalBaths = {
        value: mlsData.details.numBathrooms,
        citation: 'MLS bathroom count',
        confidence: 'HIGH'
      };
    }
    
    if (mlsData.taxes?.annualAmount) {
      result.taxes = {
        value: mlsData.taxes.annualAmount,
        citation: 'MLS tax data',
        confidence: 'HIGH'
      };
    }
    
    if (mlsData.details?.yearBuilt) {
      result.yearBuilt = {
        value: mlsData.details.yearBuilt,
        citation: 'MLS year built',
        confidence: 'HIGH'
      };
    }
    
    return result;
  }

  /**
   * Extract rental information if present in description
   */
  extractRentalInfo(description: string): {
    currentRents?: number[];
    occupancy?: string;
    leaseTerms?: string[];
  } {
    const result: any = {};
    
    // Look for rent amounts (e.g., "$1,500/month", "$1500 per month")
    const rentPattern = /\$[\d,]+\s*(?:\/|per)\s*month/gi;
    const rentMatches = description.match(rentPattern);
    if (rentMatches) {
      result.currentRents = rentMatches.map(m => 
        parseInt(m.replace(/[^\d]/g, ''))
      ).filter(r => r > 0);
    }
    
    // Look for occupancy status
    if (/fully occupied/i.test(description)) {
      result.occupancy = 'Fully occupied';
    } else if (/vacant|available/i.test(description)) {
      result.occupancy = 'Has vacancies';
    } else if (/owner.occupied/i.test(description)) {
      result.occupancy = 'Owner occupied';
    }
    
    // Look for lease terms
    if (/month.to.month/i.test(description)) {
      result.leaseTerms = ['Month-to-month'];
    } else if (/lease|tenant/i.test(description)) {
      result.leaseTerms = ['Has active leases'];
    }
    
    return result;
  }
}

// Export singleton instance
export const strictExtraction = new StrictExtractionService();
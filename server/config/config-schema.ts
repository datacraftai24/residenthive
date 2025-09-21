/**
 * Configuration Schemas
 * 
 * Defines the structure and validation for all configuration types
 * Uses Zod for runtime validation and TypeScript type generation
 */

import { z } from 'zod';

// ============================================================================
// Market Data Config (Volatile - Updated by agents from research)
// ============================================================================
export const MarketDataSchema = z.object({
  mortgageRates: z.object({
    conventional30: z.number().min(0).max(20),
    conventional15: z.number().min(0).max(20),
    fha30: z.number().min(0).max(20),
    va30: z.number().min(0).max(20),
    jumbo30: z.number().min(0).max(20),
    updatedAt: z.string().datetime(),
    source: z.string(),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW'])
  }),
  
  propertyTaxRates: z.record(z.string(), z.object({
    rate: z.number().min(0).max(0.1), // 0-10%
    effectiveDate: z.string(),
    source: z.string()
  })),
  
  insuranceCosts: z.object({
    // Per $1000 of coverage
    homeownersPerThousand: z.number().min(0).max(50),
    floodZones: z.record(z.string(), z.number()),
    updatedAt: z.string().datetime()
  }),
  
  marketTrends: z.object({
    nationalAppreciation: z.number(),
    inflationRate: z.number(),
    rentGrowthRate: z.number(),
    updatedAt: z.string().datetime()
  })
});

export type MarketDataConfig = z.infer<typeof MarketDataSchema>;

// ============================================================================
// Policy Config (Stable - Business rules and regulations)
// ============================================================================
export const PolicySchema = z.object({
  lending: z.object({
    fha: z.object({
      minDownPayment: z.number().min(0).max(1),
      maxDTI: z.number().min(0).max(1),
      upfrontMIP: z.number(),
      annualMIP: z.number(),
      selfSufficiencyTest: z.object({
        applies: z.array(z.number()), // [3, 4] for 3-4 unit properties
        minNetRentalIncome: z.number() // 75% of PITI
      })
    }),
    
    conventional: z.object({
      minDownPaymentOwnerOccupied: z.number(),
      minDownPaymentInvestment: z.number(),
      maxDTI: z.number(),
      pmiThreshold: z.number() // LTV threshold for PMI
    }),
    
    dscr: z.object({
      minRatio: z.number(), // 1.2 typical
      minDownPayment: z.number(),
      available: z.boolean()
    })
  }),
  
  loanLimits: z.object({
    fha: z.record(z.string(), z.object({
      oneUnit: z.number(),
      twoUnit: z.number(),
      threeUnit: z.number(),
      fourUnit: z.number()
    })),
    
    conforming: z.record(z.string(), z.number()),
    
    highCostMultiplier: z.number() // e.g., 1.5x for high-cost areas
  }),
  
  investorLimits: z.object({
    maxProperties: z.number(), // Fannie Mae 10 property limit
    minReserves: z.number(), // Months of PITI
    experienceRequirements: z.record(z.string(), z.any())
  })
});

export type PolicyConfig = z.infer<typeof PolicySchema>;

// ============================================================================
// Source Weights Config (Adjustable - Trust scores for data sources)
// ============================================================================
export const SourceWeightsSchema = z.object({
  weights: z.record(z.string(), z.number().min(0).max(1)),
  
  categories: z.object({
    government: z.array(z.string()),
    mls: z.array(z.string()),
    aggregators: z.array(z.string()),
    news: z.array(z.string()),
    userGenerated: z.array(z.string())
  }),
  
  adjustments: z.object({
    ageDecayRate: z.number(), // How fast weight decays with age
    disputePenalty: z.number(), // Penalty when sources disagree
    accuracyBonus: z.number() // Bonus for consistent accuracy
  })
});

export type SourceWeightsConfig = z.infer<typeof SourceWeightsSchema>;

// ============================================================================
// Reconciliation Config (Tunable - How to reconcile conflicting data)
// ============================================================================
export const ReconciliationSchema = z.object({
  metricTolerances: z.record(z.string(), z.object({
    tolerance: z.number().min(0).max(1), // Acceptable variance (0-100%)
    critical: z.boolean(), // If true, fail reconciliation on conflict
    unit: z.enum(['percent', 'absolute', 'boolean'])
  })),
  
  freshnessRequirements: z.record(z.string(), z.object({
    maxAgeDays: z.number(),
    staleWeight: z.number().min(0).max(1) // Weight multiplier when stale
  })),
  
  crossChecks: z.object({
    rentPriceRatio: z.object({
      min: z.number(),
      max: z.number(),
      severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
    }),
    
    propertyTaxCap: z.object({
      maxAnnualRate: z.number(),
      severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
    }),
    
    vacancyRentGrowth: z.object({
      maxVacancyWithNegativeGrowth: z.number(),
      minGrowthThreshold: z.number(),
      severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
    }),
    
    capRateFloor: z.object({
      minCapRate: z.number(),
      appliesTo: z.array(z.string()), // ['cash_positive', 'investment']
      severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
    })
  }),
  
  metricSensitivity: z.record(z.string(), z.object({
    normalSpread: z.number(), // Expected variance in normal conditions
    investorType: z.record(z.string(), z.number()) // Overrides by investor type
  }))
});

export type ReconciliationConfig = z.infer<typeof ReconciliationSchema>;

// ============================================================================
// County Mapping Config (Reference data)
// ============================================================================
export const CountyMappingSchema = z.object({
  cityToCounty: z.record(z.string(), z.string()),
  countyLoanLimits: z.record(z.string(), z.object({
    conforming: z.number(),
    conformingHighBalance: z.number().optional(),
    fha1: z.number(),
    fha2: z.number(),
    fha3: z.number(),
    fha4: z.number()
  })),
  propertyTaxRates: z.record(z.string(), z.number())
});

export type CountyMappingConfig = z.infer<typeof CountyMappingSchema>;

// ============================================================================
// Master Config Schema
// ============================================================================
export const ConfigSchema = z.object({
  marketData: MarketDataSchema,
  policy: PolicySchema,
  sourceWeights: SourceWeightsSchema,
  reconciliation: ReconciliationSchema,
  countyMapping: CountyMappingSchema
});

export type MasterConfig = z.infer<typeof ConfigSchema>;

// ============================================================================
// Config Key Type (for type-safe access)
// ============================================================================
export type ConfigKey = 
  | 'market-data'
  | 'policy'
  | 'source-weights'
  | 'reconciliation'
  | 'county-mapping'
  | `market-data.${string}`
  | `policy.${string}`
  | `source-weights.${string}`
  | `reconciliation.${string}`
  | `county-mapping.${string}`;

// ============================================================================
// Config Metadata Schema (for tracking)
// ============================================================================
export const ConfigMetadataSchema = z.object({
  key: z.string(),
  version: z.number(),
  updatedBy: z.string(),
  updatedAt: z.string().datetime(),
  ttl: z.number().optional(), // Seconds until expiry
  provenance: z.object({
    source: z.enum(['seed', 'agent', 'user', 'api']),
    agent: z.string().optional(),
    researchQuery: z.string().optional(),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional()
  })
});

export type ConfigMetadata = z.infer<typeof ConfigMetadataSchema>;

// ============================================================================
// Permission Schema
// ============================================================================
export const PermissionSchema = z.object({
  configKey: z.string(),
  allowedUpdaters: z.array(z.enum(['market-discovery', 'data-reconciliation', 'admin', 'system'])),
  requiresApproval: z.boolean(),
  maxUpdateFrequency: z.number().optional() // Max updates per hour
});

export type Permission = z.infer<typeof PermissionSchema>;

// ============================================================================
// Helper Functions
// ============================================================================
export function getSchemaForKey(key: ConfigKey): z.ZodSchema<any> | null {
  const [section, ...path] = key.split('.');
  
  switch (section) {
    case 'market-data':
      return MarketDataSchema;
    case 'policy':
      return PolicySchema;
    case 'source-weights':
      return SourceWeightsSchema;
    case 'reconciliation':
      return ReconciliationSchema;
    case 'county-mapping':
      return CountyMappingSchema;
    default:
      return null;
  }
}

export function validateConfigValue(key: ConfigKey, value: any): { success: boolean; error?: string } {
  const schema = getSchemaForKey(key);
  if (!schema) {
    return { success: false, error: `Unknown config key: ${key}` };
  }
  
  try {
    schema.parse(value);
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors.map(e => e.message).join(', ') };
    }
    return { success: false, error: String(error) };
  }
}
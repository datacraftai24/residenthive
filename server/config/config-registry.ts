/**
 * Configuration Registry
 * 
 * Central registry for all configuration values with:
 * - TTL support for volatile data
 * - Schema validation
 * - Atomic updates
 * - Audit logging
 * - Permission checking
 */

import { db } from '../db.js';
import { configValues, configAuditLog } from '../../shared/schema.js';
import { eq, and, gt } from 'drizzle-orm';
import { 
  ConfigKey, 
  ConfigMetadata,
  validateConfigValue,
  getSchemaForKey,
  Permission
} from './config-schema.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// In-memory cache for performance
interface CachedConfig {
  value: any;
  metadata: ConfigMetadata;
  expiresAt?: Date;
}

export class ConfigRegistry {
  private static instance: ConfigRegistry;
  private cache: Map<string, CachedConfig> = new Map();
  private permissions: Map<string, Permission> = new Map();
  private initialized = false;
  
  private constructor() {}
  
  static getInstance(): ConfigRegistry {
    if (!ConfigRegistry.instance) {
      ConfigRegistry.instance = new ConfigRegistry();
    }
    return ConfigRegistry.instance;
  }
  
  /**
   * Initialize the registry with seed data and permissions
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log('🔧 Initializing ConfigRegistry...');
    
    // Load permissions
    await this.loadPermissions();
    
    // Load seed configs if database is empty
    await this.loadSeedConfigs();
    
    // Load all configs into cache
    await this.refreshCache();
    
    // Start TTL checker
    this.startTTLChecker();
    
    this.initialized = true;
    console.log('✅ ConfigRegistry initialized');
  }
  
  /**
   * Get a configuration value
   */
  async getValue<T = any>(key: ConfigKey, defaultValue?: T): Promise<T> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached) {
      // Check if expired
      if (cached.expiresAt && cached.expiresAt < new Date()) {
        console.log(`⏰ Config ${key} expired, refreshing...`);
        await this.refreshConfigFromDB(key);
        const refreshed = this.cache.get(key);
        return refreshed ? refreshed.value : defaultValue;
      }
      return cached.value;
    }
    
    // Load from database
    const dbValue = await this.loadFromDB(key);
    if (dbValue) {
      this.cache.set(key, dbValue);
      return dbValue.value;
    }
    
    // Return default
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    
    throw new Error(`Config not found: ${key}`);
  }
  
  /**
   * Update a configuration value
   */
  async updateValue(
    key: ConfigKey, 
    value: any, 
    updater: string,
    options?: {
      ttl?: number; // Seconds
      provenance?: {
        source: 'seed' | 'agent' | 'user' | 'api';
        agent?: string;
        researchQuery?: string;
        confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
      };
    }
  ): Promise<void> {
    // Check permissions
    if (!this.hasPermission(key, updater)) {
      throw new Error(`${updater} does not have permission to update ${key}`);
    }
    
    // Validate against schema
    const validation = validateConfigValue(key, value);
    if (!validation.success) {
      throw new Error(`Invalid config value for ${key}: ${validation.error}`);
    }
    
    // Atomic update in database
    const metadata: ConfigMetadata = {
      key,
      version: await this.getNextVersion(key),
      updatedBy: updater,
      updatedAt: new Date().toISOString(),
      ttl: options?.ttl,
      provenance: options?.provenance || { source: 'user' }
    };
    
    await db.transaction(async (tx) => {
      // Insert or update config value
      const existing = await tx.select()
        .from(configValues)
        .where(eq(configValues.key, key))
        .limit(1);
      
      if (existing.length > 0) {
        await tx.update(configValues)
          .set({
            value: JSON.stringify(value),
            version: metadata.version,
            updatedBy: metadata.updatedBy,
            updatedAt: metadata.updatedAt,
            ttlExpiresAt: options?.ttl 
              ? new Date(Date.now() + options.ttl * 1000).toISOString()
              : null,
            provenance: JSON.stringify(metadata.provenance)
          })
          .where(eq(configValues.key, key));
      } else {
        await tx.insert(configValues).values({
          key,
          value: JSON.stringify(value),
          version: metadata.version,
          updatedBy: metadata.updatedBy,
          updatedAt: metadata.updatedAt,
          ttlExpiresAt: options?.ttl 
            ? new Date(Date.now() + options.ttl * 1000).toISOString()
            : null,
          provenance: JSON.stringify(metadata.provenance)
        });
      }
      
      // Add audit log entry
      await tx.insert(configAuditLog).values({
        configKey: key,
        previousValue: existing[0]?.value || null,
        newValue: JSON.stringify(value),
        updatedBy: metadata.updatedBy,
        updatedAt: metadata.updatedAt,
        provenance: JSON.stringify(metadata.provenance)
      });
    });
    
    // Update cache
    const cached: CachedConfig = {
      value,
      metadata,
      expiresAt: options?.ttl ? new Date(Date.now() + options.ttl * 1000) : undefined
    };
    this.cache.set(key, cached);
    
    console.log(`✅ Updated config ${key} by ${updater}`);
  }
  
  /**
   * Get audit history for a config key
   */
  async getAuditHistory(key: ConfigKey, limit = 10): Promise<any[]> {
    const history = await db.select()
      .from(configAuditLog)
      .where(eq(configAuditLog.configKey, key))
      .orderBy(configAuditLog.updatedAt)
      .limit(limit);
    
    return history.map(entry => ({
      ...entry,
      previousValue: entry.previousValue ? JSON.parse(entry.previousValue) : null,
      newValue: JSON.parse(entry.newValue),
      provenance: JSON.parse(entry.provenance)
    }));
  }
  
  /**
   * Bulk get multiple config values
   */
  async getValues(keys: ConfigKey[]): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    
    for (const key of keys) {
      try {
        result[key] = await this.getValue(key);
      } catch (error) {
        console.warn(`Failed to get config ${key}:`, error);
      }
    }
    
    return result;
  }
  
  /**
   * Check if a config value is stale
   */
  isStale(key: ConfigKey, maxAgeSeconds: number): boolean {
    const cached = this.cache.get(key);
    if (!cached) return true;
    
    const age = (Date.now() - new Date(cached.metadata.updatedAt).getTime()) / 1000;
    return age > maxAgeSeconds;
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  private async loadFromDB(key: string): Promise<CachedConfig | null> {
    const result = await db.select()
      .from(configValues)
      .where(eq(configValues.key, key))
      .limit(1);
    
    if (result.length === 0) return null;
    
    // Check TTL expiry
    const row = result[0];
    if (row.ttlExpiresAt && new Date(row.ttlExpiresAt) < new Date()) {
      return null; // Expired
    }
    return {
      value: JSON.parse(row.value),
      metadata: {
        key: row.key,
        version: row.version,
        updatedBy: row.updatedBy,
        updatedAt: row.updatedAt,
        provenance: JSON.parse(row.provenance)
      },
      expiresAt: row.ttlExpiresAt ? new Date(row.ttlExpiresAt) : undefined
    };
  }
  
  private async refreshConfigFromDB(key: string): Promise<void> {
    const dbValue = await this.loadFromDB(key);
    if (dbValue) {
      this.cache.set(key, dbValue);
    } else {
      this.cache.delete(key);
    }
  }
  
  private async refreshCache(): Promise<void> {
    const allConfigs = await db.select()
      .from(configValues);
    
    // Filter expired configs in JS since the OR condition is complex
    const validConfigs = allConfigs.filter(config => {
      if (!config.ttlExpiresAt) return true;
      return new Date(config.ttlExpiresAt) > new Date();
    });
    
    for (const config of validConfigs) {
      this.cache.set(config.key, {
        value: JSON.parse(config.value),
        metadata: {
          key: config.key,
          version: config.version,
          updatedBy: config.updatedBy,
          updatedAt: config.updatedAt,
          provenance: JSON.parse(config.provenance)
        },
        expiresAt: config.ttlExpiresAt ? new Date(config.ttlExpiresAt) : undefined
      });
    }
    
    console.log(`📦 Loaded ${validConfigs.length} configs into cache`);
  }
  
  private async loadSeedConfigs(): Promise<void> {
    // Check if database has any configs
    const existingCount = await db.select()
      .from(configValues)
      .limit(1);
    
    if (existingCount.length > 0) {
      console.log('📦 Configs already exist, skipping seed load');
      return;
    }
    
    console.log('🌱 Loading seed configs...');
    
    // Load seed files
    const seedDir = path.join(process.cwd(), 'server', 'config', 'seeds');
    const seedFiles = [
      'market-data.json',
      'policy.json',
      'source-weights.json',
      'reconciliation.json',
      'county-mapping.json'
    ];
    
    for (const file of seedFiles) {
      try {
        const filePath = path.join(seedDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        const key = file.replace('.json', '') as ConfigKey;
        
        await this.updateValue(key, data, 'system', {
          provenance: { source: 'seed' }
        });
        
        console.log(`  ✅ Loaded ${key}`);
      } catch (error) {
        console.warn(`  ⚠️ Failed to load ${file}:`, error);
      }
    }
  }
  
  private async loadPermissions(): Promise<void> {
    // Default permissions (could be loaded from config)
    const defaultPermissions: Permission[] = [
      // Market data - agents can update
      {
        configKey: 'market-data',
        allowedUpdaters: ['market-discovery', 'admin', 'system', 'test-script'],
        requiresApproval: false,
        maxUpdateFrequency: 24 // Once per hour
      },
      {
        configKey: 'market-data.mortgageRates',
        allowedUpdaters: ['market-discovery', 'admin'],
        requiresApproval: false,
        maxUpdateFrequency: 24
      },
      
      // Policy - admin only
      {
        configKey: 'policy',
        allowedUpdaters: ['admin', 'system'],
        requiresApproval: true
      },
      
      // Source weights - reconciliation agent can tune
      {
        configKey: 'source-weights',
        allowedUpdaters: ['data-reconciliation', 'admin', 'system', 'test-script'],
        requiresApproval: false,
        maxUpdateFrequency: 168 // Once per week
      },
      
      // Reconciliation - reconciliation agent can tune
      {
        configKey: 'reconciliation',
        allowedUpdaters: ['data-reconciliation', 'admin', 'system'],
        requiresApproval: false,
        maxUpdateFrequency: 24
      },
      
      // County mapping - admin only
      {
        configKey: 'county-mapping',
        allowedUpdaters: ['admin', 'system'],
        requiresApproval: true
      }
    ];
    
    for (const perm of defaultPermissions) {
      this.permissions.set(perm.configKey, perm);
    }
  }
  
  private hasPermission(key: string, updater: string): boolean {
    // Check exact key first
    let permission = this.permissions.get(key);
    
    // Fall back to parent key
    if (!permission) {
      const parentKey = key.split('.')[0];
      permission = this.permissions.get(parentKey);
    }
    
    if (!permission) return false;
    
    return permission.allowedUpdaters.includes(updater as any);
  }
  
  private async getNextVersion(key: string): Promise<number> {
    const current = await db.select()
      .from(configValues)
      .where(eq(configValues.key, key))
      .limit(1);
    
    return current.length > 0 ? current[0].version + 1 : 1;
  }
  
  private startTTLChecker(): void {
    // Check for expired configs every minute
    setInterval(async () => {
      const now = new Date();
      
      for (const [key, cached] of this.cache.entries()) {
        if (cached.expiresAt && cached.expiresAt < now) {
          console.log(`🗑️ Removing expired config: ${key}`);
          this.cache.delete(key);
          
          // Optionally reload from DB or seed
          await this.refreshConfigFromDB(key);
        }
      }
    }, 60000); // Every minute
  }
}

// Export singleton instance
export const configRegistry = ConfigRegistry.getInstance();
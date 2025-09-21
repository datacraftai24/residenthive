/**
 * Fact Store - Persistent, validated source of truth for investment facts
 * 
 * Core data persistence layer with versioning, indexes, and automatic expiry
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Type definitions
export type FactTopic = 
  | 'adu_rules'
  | 'section8'
  | 'incentives'
  | 'taxes'
  | 'schools'
  | 'crime'
  | 'hoa'
  | 'comps'
  | 'demographics'
  | 'market_trends';

export type ScopeLevel = 'state' | 'county' | 'city' | 'zip' | 'parcel';
export type FactStatus = 'current' | 'conflict' | 'needs_review' | 'stale';

export interface Fact {
  id: string;
  topic: FactTopic;
  scopeLevel: ScopeLevel;
  scopeValue: string;
  key: string;
  value: any;
  sourceUrl?: string;
  confidence: number;
  status: FactStatus;
  version: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FactQuery {
  topic: FactTopic;
  scopeLevel: ScopeLevel;
  scopeValue: string;
  key: string;
}

export interface FactStoreOptions {
  dataDir?: string;
  writeQueueSize?: number;
  defaultTTLDays?: number;
}

export class FactStore {
  private dataDir: string;
  private facts: Map<string, Fact> = new Map();
  private indexes: {
    byTopic: Map<FactTopic, Set<string>>;
    byScope: Map<string, Set<string>>;
    byStatus: Map<FactStatus, Set<string>>;
  };
  private writeQueue: Fact[] = [];
  private writeQueueSize: number;
  private defaultTTLDays: number;
  private initialized = false;

  constructor(options: FactStoreOptions = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'fact-store');
    this.writeQueueSize = options.writeQueueSize || 10;
    this.defaultTTLDays = options.defaultTTLDays || 30;
    
    this.indexes = {
      byTopic: new Map(),
      byScope: new Map(),
      byStatus: new Map()
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    // Load existing facts
    await this.loadFacts();
    
    // Mark stale facts on startup
    this.markStaleFactsOnLoad();
    
    this.initialized = true;
  }

  /**
   * Store a fact with automatic versioning
   */
  async store(factData: Omit<Fact, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<Fact> {
    const factKey = this.getFactKey(factData);
    const existing = this.facts.get(factKey);
    
    const now = new Date();
    const fact: Fact = {
      ...factData,
      id: existing?.id || this.generateId(),  // Keep same ID for same tuple
      version: existing ? existing.version + 1 : 1,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      expiresAt: factData.expiresAt || this.getDefaultExpiry(factData.topic)
    };
    
    // Update indexes
    this.updateIndexes(fact, existing);
    
    // Store in memory
    this.facts.set(factKey, fact);
    
    // Queue for disk write
    this.queueWrite(fact);
    
    return fact;
  }

  /**
   * Store many facts efficiently
   */
  async storeMany(facts: Array<Omit<Fact, 'id' | 'version' | 'createdAt' | 'updatedAt'>>): Promise<Fact[]> {
    const stored: Fact[] = [];
    
    for (const factData of facts) {
      const fact = await this._storeUnsafe(factData);
      stored.push(fact);
    }
    
    // Batch write
    if (this.writeQueue.length > 0) {
      await this.flushWriteQueue();
    }
    
    return stored;
  }

  /**
   * Internal store without triggering queue (for storeMany)
   */
  private async _storeUnsafe(factData: Omit<Fact, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<Fact> {
    const factKey = this.getFactKey(factData);
    const existing = this.facts.get(factKey);
    
    const now = new Date();
    const fact: Fact = {
      ...factData,
      id: existing?.id || this.generateId(),
      version: existing ? existing.version + 1 : 1,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      expiresAt: factData.expiresAt || this.getDefaultExpiry(factData.topic)
    };
    
    // Update indexes
    this.updateIndexes(fact, existing);
    
    // Store in memory
    this.facts.set(factKey, fact);
    
    // Add to queue without triggering flush
    this.writeQueue.push(fact);
    
    return fact;
  }

  /**
   * Get a fact by query
   */
  async get(query: FactQuery, options?: { noTouch?: boolean }): Promise<Fact | null> {
    const key = this.getFactKey(query);
    const fact = this.facts.get(key);
    
    if (!fact) return null;
    
    // Mark as accessed unless noTouch
    if (!options?.noTouch) {
      fact.updatedAt = new Date();
    }
    
    return fact;
  }

  /**
   * Get many facts efficiently
   */
  async getMany(queries: FactQuery[], options?: { noTouch?: boolean }): Promise<(Fact | null)[]> {
    return Promise.all(queries.map(q => this.get(q, options)));
  }

  /**
   * Get facts by topic
   */
  async getByTopic(topic: FactTopic): Promise<Fact[]> {
    const factIds = this.indexes.byTopic.get(topic) || new Set();
    const facts: Fact[] = [];
    
    for (const id of factIds) {
      const fact = Array.from(this.facts.values()).find(f => f.id === id);
      if (fact) facts.push(fact);
    }
    
    return facts;
  }

  /**
   * Get facts by status
   */
  async getByStatus(status: FactStatus): Promise<Fact[]> {
    const factKeys = this.indexes.byStatus.get(status) || new Set();
    const facts: Fact[] = [];
    
    for (const key of factKeys) {
      const fact = this.facts.get(key);
      if (fact) facts.push(fact);
    }
    
    return facts;
  }

  /**
   * Mark fact as stale
   */
  async markStale(query: FactQuery): Promise<void> {
    const fact = await this.get(query, { noTouch: true });
    if (fact) {
      fact.status = 'stale';
      this.updateIndexes(fact);
      this.queueWrite(fact);
    }
  }

  /**
   * Get store statistics
   */
  getStats(): { totalFacts: number; byTopic: Record<string, number>; byStatus: Record<string, number> } {
    const byTopic: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    
    for (const [topic, ids] of this.indexes.byTopic) {
      byTopic[topic] = ids.size;
    }
    
    for (const [status, keys] of this.indexes.byStatus) {
      byStatus[status] = keys.size;
    }
    
    return {
      totalFacts: this.facts.size,
      byTopic,
      byStatus
    };
  }

  /**
   * Generate composite key for fact
   */
  private getFactKey(fact: Partial<Fact> | FactQuery): string {
    return `${fact.topic}:${fact.scopeLevel}:${fact.scopeValue}:${fact.key}`;
  }

  /**
   * Generate stable ID
   */
  private generateId(): string {
    return `FACT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update secondary indexes
   */
  private updateIndexes(fact: Fact, oldFact?: Fact): void {
    const factKey = this.getFactKey(fact);
    
    // Update topic index
    if (!this.indexes.byTopic.has(fact.topic)) {
      this.indexes.byTopic.set(fact.topic, new Set());
    }
    this.indexes.byTopic.get(fact.topic)!.add(fact.id);
    
    // Update scope index
    const scopeKey = `${fact.scopeLevel}:${fact.scopeValue}`;
    if (!this.indexes.byScope.has(scopeKey)) {
      this.indexes.byScope.set(scopeKey, new Set());
    }
    this.indexes.byScope.get(scopeKey)!.add(fact.id);
    
    // Update status index
    if (oldFact && oldFact.status !== fact.status) {
      // Remove from old status
      const oldKey = this.getFactKey(oldFact);
      this.indexes.byStatus.get(oldFact.status)?.delete(oldKey);
    }
    
    if (!this.indexes.byStatus.has(fact.status)) {
      this.indexes.byStatus.set(fact.status, new Set());
    }
    this.indexes.byStatus.get(fact.status)!.add(factKey);
  }

  /**
   * Queue fact for disk write
   */
  private queueWrite(fact: Fact): void {
    this.writeQueue.push(fact);
    
    if (this.writeQueue.length >= this.writeQueueSize) {
      this.flushWriteQueue();
    }
  }

  /**
   * Flush write queue to disk
   */
  private async flushWriteQueue(): Promise<void> {
    if (this.writeQueue.length === 0) return;
    
    const toWrite = [...this.writeQueue];
    this.writeQueue = [];
    
    for (const fact of toWrite) {
      await this.writeFact(fact);
    }
  }

  /**
   * Write fact to disk
   */
  private async writeFact(fact: Fact): Promise<void> {
    const filePath = this.getFactFilePath(fact);
    const dir = path.dirname(filePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(fact, null, 2));
  }

  /**
   * Get file path for fact (composite path to prevent collisions)
   */
  private getFactFilePath(fact: Fact): string {
    return path.join(
      this.dataDir,
      fact.topic,
      fact.scopeLevel,
      fact.scopeValue,
      `${fact.key}.json`
    );
  }

  /**
   * Load facts from disk
   */
  private async loadFacts(): Promise<void> {
    if (!fs.existsSync(this.dataDir)) return;
    
    const loadDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          loadDir(fullPath);
        } else if (entry.name.endsWith('.json')) {
          try {
            const data = fs.readFileSync(fullPath, 'utf-8');
            const fact = JSON.parse(data) as Fact;
            
            // Convert dates
            fact.expiresAt = new Date(fact.expiresAt);
            fact.createdAt = new Date(fact.createdAt);
            fact.updatedAt = new Date(fact.updatedAt);
            
            const key = this.getFactKey(fact);
            this.facts.set(key, fact);
            this.updateIndexes(fact);
          } catch (error) {
            console.error(`Failed to load fact from ${fullPath}:`, error);
          }
        }
      }
    };
    
    loadDir(this.dataDir);
  }

  /**
   * Mark stale facts on startup
   */
  private markStaleFactsOnLoad(): void {
    const now = new Date();
    
    for (const fact of this.facts.values()) {
      if (fact.expiresAt < now && fact.status !== 'stale') {
        fact.status = 'stale';
        this.updateIndexes(fact);
      }
    }
  }

  /**
   * Get default expiry for topic
   */
  private getDefaultExpiry(topic: FactTopic): Date {
    const now = new Date();
    const endOfDay = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + this.defaultTTLDays,
      0, 0, 0, 0
    ));
    
    return endOfDay;
  }
}
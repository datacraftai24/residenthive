#!/usr/bin/env tsx
/**
 * Create config tables in the database
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

async function createConfigTables() {
  console.log('📦 Creating config tables...\n');
  
  try {
    // Create config_values table
    console.log('Creating config_values table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS config_values (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        ttl_expires_at TEXT,
        provenance TEXT NOT NULL
      )
    `);
    console.log('✅ config_values table created');
    
    // Create config_audit_log table
    console.log('Creating config_audit_log table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS config_audit_log (
        id SERIAL PRIMARY KEY,
        config_key TEXT NOT NULL,
        previous_value TEXT,
        new_value TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        provenance TEXT NOT NULL,
        change_reason TEXT
      )
    `);
    console.log('✅ config_audit_log table created');
    
    // Create config_access_log table (optional)
    console.log('Creating config_access_log table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS config_access_log (
        id SERIAL PRIMARY KEY,
        config_key TEXT NOT NULL,
        accessed_by TEXT NOT NULL,
        accessed_at TEXT NOT NULL,
        purpose TEXT
      )
    `);
    console.log('✅ config_access_log table created');
    
    // Create indexes for better performance
    console.log('\nCreating indexes...');
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_config_values_key ON config_values(key);
      CREATE INDEX IF NOT EXISTS idx_config_audit_log_key ON config_audit_log(config_key);
      CREATE INDEX IF NOT EXISTS idx_config_audit_log_updated ON config_audit_log(updated_at);
    `);
    console.log('✅ Indexes created');
    
    console.log('\n🎉 All config tables created successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    process.exit(1);
  }
}

createConfigTables();
#!/usr/bin/env node
/**
 * Migration script to switch from JSON-based to database-based MarketStatsStore
 * This will remove the JSON files and update the imports
 */

import fs from 'fs/promises';
import path from 'path';

const filesToUpdate = [
  'server/index.ts',
  'server/agents/property-evaluator-comprehensive.ts',
  'server/agents/property-evaluator-comprehensive.backup.ts',
  'server/services/market-stats-store.ts'
];

const dataFilesToRemove = [
  'data/seed-market/boston.json',
  'data/seed-market/national.json', 
  'data/seed-market/worcester.json',
  'data/market-stats.json'
];

async function migrateToDatabase() {
  console.log('🔄 Starting migration to database-based MarketStatsStore...');

  // 1. Update import statements in files
  for (const file of filesToUpdate) {
    try {
      const exists = await fs.access(file).then(() => true).catch(() => false);
      if (!exists) {
        console.log(`⏭️  Skipping ${file} (not found)`);
        continue;
      }

      let content = await fs.readFile(file, 'utf8');
      
      // Update import paths
      content = content.replace(
        /from ['"]\.\.?\/.*market-stats-store(\.js)?['"]/g,
        "from '../services/database-market-stats-store.js'"
      );
      
      // Update variable references
      content = content.replace(
        /marketStatsStore/g,
        'databaseMarketStatsStore'
      );
      
      await fs.writeFile(file, content);
      console.log(`✅ Updated ${file}`);
    } catch (error) {
      console.log(`⚠️  Could not update ${file}:`, error.message);
    }
  }

  // 2. Remove JSON data files
  console.log('\n🗑️  Removing JSON data files...');
  for (const file of dataFilesToRemove) {
    try {
      await fs.unlink(file);
      console.log(`✅ Removed ${file}`);
    } catch (error) {
      console.log(`⏭️  ${file} already removed or not found`);
    }
  }

  // 3. Remove empty seed-market directory if it exists
  try {
    const seedMarketDir = 'data/seed-market';
    const files = await fs.readdir(seedMarketDir);
    if (files.length === 0) {
      await fs.rmdir(seedMarketDir);
      console.log(`✅ Removed empty directory ${seedMarketDir}`);
    } else {
      console.log(`⏭️  Directory ${seedMarketDir} not empty, keeping it`);
    }
  } catch (error) {
    console.log(`⏭️  Directory data/seed-market already removed or not found`);
  }

  console.log('\n✅ Migration completed!');
  console.log('📋 Summary of changes:');
  console.log('  • Switched to database-backed MarketStatsStore');
  console.log('  • Removed JSON seed files');
  console.log('  • Market data now sourced from investment_strategies table');
  console.log('  • Restart your development server to see the changes');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateToDatabase().catch(console.error);
}

export { migrateToDatabase };
/**
 * Test script for Two-Pass Extraction System
 * Run with: npx ts-node test-extraction.ts
 */

import { testExtraction } from './server/services/extraction/two-pass-extractor';

async function main() {
  try {
    await testExtraction();
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

main();
#!/usr/bin/env tsx
/**
 * Test Runner with .env.local support
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local for development testing
config({ path: resolve(process.cwd(), '.env.local') });

// Now run the specified test
const testFile = process.argv[2];
if (!testFile) {
  console.error('Usage: tsx test-runner.ts <test-file>');
  process.exit(1);
}

// Import and run the test
import(testFile).catch(console.error);
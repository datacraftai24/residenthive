import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure Neon for serverless with proper WebSocket setup
neonConfig.webSocketConstructor = ws;

// Add connection configuration for better reliability
const connectionConfig = {
  connectionString: process.env.DATABASE_URL,
  // Add connection timeout and retry logic
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10, // Maximum number of connections in the pool
};

export const pool = new Pool(connectionConfig);
export const db = drizzle({ client: pool, schema });

/**
 * Test database connection by executing a simple query
 */
export async function testConnection(): Promise<boolean> {
  try {
    console.log('🔍 Attempting to connect to database...');
    const client = await pool.connect();
    console.log('🔗 Database client connected, testing query...');
    
    const result = await client.query('SELECT 1 as test, version() as version');
    console.log('✅ Database query successful:', result.rows[0]);
    
    client.release();
    console.log('✅ Database connection test completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:');
    if (error instanceof Error) {
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      
      // Check for specific error properties
      if ('code' in error) {
        console.error('Error code:', (error as any).code);
      }
      if ('hostname' in error) {
        console.error('Hostname:', (error as any).hostname);
      }
    } else {
      console.error('Unknown error:', error);
    }
    return false;
  }
}

/**
 * Health check for database connection
 */
export async function healthCheck(): Promise<boolean> {
  return testConnection();
}
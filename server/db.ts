import * as schema from "@shared/schema";

// Determine if we're in local development or production
const isLocalDev = process.env.NODE_ENV === 'development' && !process.env.NEON_DATABASE;

let db: any;
let pool: any;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

if (isLocalDev) {
  // Local development: Use standard PostgreSQL
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const pg = await import('pg');
  const { Pool } = pg.default;

  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });

  console.log('📦 Using local PostgreSQL connection');
} else {
  // Production: Use Neon with WebSocket
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const ws = await import('ws');

  neonConfig.webSocketConstructor = ws.default;

  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });

  console.log('☁️ Using Neon WebSocket connection');
}

export { db, pool };

/**
 * Test database connection by executing a simple query
 */
export async function testConnection(): Promise<boolean> {
  try {
    if (isLocalDev) {
      // For local PostgreSQL
      await pool.query('SELECT 1');
    } else {
      // For Neon
      await pool.sql`SELECT 1`;
    }
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}
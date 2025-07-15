import { Pool, PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

/**
 * Database connection configuration for dual environment compatibility:
 * 
 * 1. Replit Environment:
 *    - Uses TCP connection with standard PostgreSQL DATABASE_URL
 *    - Format: postgresql://user:password@host:port/database
 * 
 * 2. Google Cloud Run Environment:
 *    - Uses Unix socket connection for Cloud SQL
 *    - Format: postgresql://<USER>:<PASSWORD>@/<DATABASE>?host=/cloudsql/<PROJECT_ID>:<REGION>:<INSTANCE_NAME>
 *    - Detects Cloud SQL by checking for '/cloudsql/' in DATABASE_URL
 */

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * Detect environment based on DATABASE_URL pattern
 * Cloud SQL Proxy uses unix socket paths containing '/cloudsql/'
 */
const isCloudSQL = process.env.DATABASE_URL.includes('/cloudsql/');

/**
 * Parse Cloud SQL unix socket connection string manually
 * Avoids using new URL() which fails on unix socket paths
 * 
 * Expected format: postgresql://user:password@/database?host=/cloudsql/project:region:instance
 * 
 * @param connectionString - The Cloud SQL connection string
 * @returns Parsed connection components
 */
function parseCloudSQLConnectionString(connectionString: string): {
  user: string;
  password: string;
  database: string;
  socketPath: string;
} {
  // Split on '?' to separate the base URL from query parameters
  const [baseUrl, queryString] = connectionString.split('?');
  
  if (!queryString) {
    throw new Error(
      'Invalid Cloud SQL connection string: missing query parameters. ' +
      'Expected format: postgresql://user:password@/database?host=/cloudsql/project:region:instance'
    );
  }

  // Parse the base URL manually (before query params)
  // Format: postgresql://user:password@/database
  const urlMatch = baseUrl.match(/^postgresql:\/\/([^:]+):([^@]+)@\/(.+)$/);
  
  if (!urlMatch) {
    throw new Error(
      'Invalid Cloud SQL connection string format. ' +
      'Expected: postgresql://user:password@/database?host=/cloudsql/project:region:instance'
    );
  }

  const [, user, password, database] = urlMatch;

  // Parse query parameters to extract socket path
  const searchParams = new URLSearchParams(queryString);
  const socketPath = searchParams.get('host');

  if (!socketPath || !socketPath.includes('/cloudsql/')) {
    throw new Error(
      'Invalid Cloud SQL connection string: missing or invalid host parameter. ' +
      'Expected host=/cloudsql/project:region:instance'
    );
  }

  // Validate socket path format
  const socketPathMatch = socketPath.match(/^\/cloudsql\/[^:]+:[^:]+:[^:]+$/);
  if (!socketPathMatch) {
    throw new Error(
      'Invalid Cloud SQL socket path format. ' +
      'Expected: /cloudsql/project:region:instance'
    );
  }

  return {
    user: decodeURIComponent(user),
    password: decodeURIComponent(password),
    database: decodeURIComponent(database),
    socketPath
  };
}

/**
 * Create database connection configuration based on environment
 * Uses different parsing strategies for unix socket vs TCP connections
 */
function createPoolConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL!;
  
  if (isCloudSQL) {
    // Google Cloud Run with Cloud SQL Unix Socket
    console.log('🔌 Configuring database for Google Cloud Run (Unix Socket)');
    
    try {
      const { user, password, database, socketPath } = parseCloudSQLConnectionString(connectionString);
      
      console.log(`📍 Connecting to database '${database}' as user '${user}' via socket '${socketPath}'`);
      
      return {
        user,
        password,
        database,
        host: socketPath,
        port: undefined, // Unix socket doesn't use port
        // Cloud SQL specific configuration
        ssl: false, // Unix socket doesn't need SSL
        // Connection pool settings optimized for serverless
        max: 10, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
        // Additional Cloud SQL optimizations
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
      };
    } catch (error) {
      console.error('❌ Failed to parse Cloud SQL connection string:', error);
      throw error;
    }
  } else {
    // Replit or other TCP-based PostgreSQL
    console.log('🔌 Configuring database for Replit/TCP connection');
    
    // For TCP connections, we can safely use the full connection string
    // Extract host info for logging (optional, for debugging)
    try {
      const url = new URL(connectionString);
      console.log(`📍 Connecting to database '${url.pathname.slice(1)}' at host '${url.hostname}:${url.port}'`);
    } catch (error) {
      console.log('📍 Connecting to database via TCP (could not parse URL for logging)');
    }
    
    return {
      connectionString,
      // SSL configuration for external databases (like Neon, Supabase, etc.)
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      // Connection pool settings
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      // TCP-specific optimizations
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    };
  }
}

/**
 * Create and configure the database connection pool
 */
export const pool = new Pool(createPoolConfig());

/**
 * Handle pool errors to prevent application crashes
 */
pool.on('error', (err) => {
  console.error('🚨 Unexpected error on idle database client:', err);
});

/**
 * Graceful shutdown handler
 */
process.on('SIGINT', async () => {
  console.log('🔄 Gracefully shutting down database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Gracefully shutting down database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
  process.exit(0);
});

/**
 * Drizzle ORM instance configured with the connection pool
 * This maintains compatibility with existing schema and queries
 */
export const db = drizzle(pool, { schema });

/**
 * Test database connection and return detailed status information
 * Call this function during application startup to verify connectivity
 * 
 * @returns Promise<boolean> - true if connection successful, false otherwise
 */
export async function testConnection(): Promise<boolean> {
  const startTime = Date.now();
  let client;
  
  try {
    console.log('🔍 Testing database connection...');
    
    // Get a client from the pool
    client = await pool.connect();
    
    // Test basic connectivity
    const result = await client.query('SELECT 1 as connection_test, current_database() as db_name, version() as pg_version');
    
    const connectionTime = Date.now() - startTime;
    
    if (result.rows && result.rows.length > 0) {
      const { connection_test, db_name, pg_version } = result.rows[0];
      
      console.log('✅ Database connection successful');
      console.log(`📊 Connection time: ${connectionTime}ms`);
      console.log(`🗄️  Database: ${db_name}`);
      console.log(`🐘 PostgreSQL version: ${pg_version.split(' ')[0] + ' ' + pg_version.split(' ')[1]}`);
      console.log(`🔧 Environment: ${isCloudSQL ? 'Cloud SQL Unix Socket' : 'TCP Connection'}`);
      
      return true;
    } else {
      console.error('❌ Database connection test returned unexpected result');
      return false;
    }
  } catch (error) {
    const connectionTime = Date.now() - startTime;
    console.error('❌ Database connection failed:', error);
    console.error(`⏱️  Failed after: ${connectionTime}ms`);
    console.error(`🔧 Environment: ${isCloudSQL ? 'Cloud SQL Unix Socket' : 'TCP Connection'}`);
    
    if (error instanceof Error) {
      console.error(`📋 Error details: ${error.message}`);
      
      // Provide specific troubleshooting hints based on error type
      if (error.message.includes('ENOTFOUND')) {
        console.error('💡 Hint: Check if the database host is correct and accessible');
      } else if (error.message.includes('ECONNREFUSED')) {
        console.error('💡 Hint: Check if the database server is running and accepting connections');
      } else if (error.message.includes('authentication failed')) {
        console.error('💡 Hint: Check database username and password');
      } else if (error.message.includes('No such file or directory') && isCloudSQL) {
        console.error('💡 Hint: Check if Cloud SQL unix socket path is correct and accessible');
      }
    }
    
    return false;
  } finally {
    // Always release the client back to the pool
    if (client) {
      client.release();
    }
  }
}

/**
 * Get detailed connection and pool information for monitoring and debugging
 * 
 * @returns Object containing connection status and pool metrics
 */
export function getConnectionInfo() {
  return {
    environment: isCloudSQL ? 'Google Cloud Run (Unix Socket)' : 'Replit/TCP',
    connectionString: process.env.DATABASE_URL?.replace(/:[^:]*@/, ':***@'), // Mask password
    poolSize: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
    maxConnections: pool.options.max,
    isCloudSQL,
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

/**
 * Perform a health check that can be used by load balancers or monitoring systems
 * More lightweight than testConnection()
 * 
 * @returns Promise<boolean> - true if healthy, false otherwise
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

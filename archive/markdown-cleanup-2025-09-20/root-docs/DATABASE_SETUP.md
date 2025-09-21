# Database Setup Guide

This guide covers the dual-environment database configuration for Replit and Google Cloud Run deployments.

## Overview

The application now supports two database connection modes:

1. **Replit Environment**: TCP connection using standard PostgreSQL connection strings
2. **Google Cloud Run**: Unix socket connection for Cloud SQL integration

## Environment Detection

The system automatically detects the environment based on the `DATABASE_URL` format:

- **TCP (Replit)**: `postgresql://user:password@host:port/database`
- **Unix Socket (Cloud SQL)**: `postgresql://<USER>:<PASSWORD>@/<DATABASE>?host=/cloudsql/<PROJECT_ID>:<REGION>:<INSTANCE_NAME>`

## Dependencies

### Updated package.json

```json
{
  "dependencies": {
    "pg": "^8.12.0",
    "drizzle-orm": "^0.39.1"
  },
  "devDependencies": {
    "@types/pg": "^8.11.10"
  }
}
```

### Removed Dependencies

- `@neondatabase/serverless`: No longer needed
- `ws`: No longer needed for database connections

## Installation

```bash
npm install
```

## Environment Variables

### For Replit Deployment

```bash
# Standard PostgreSQL connection (TCP)
DATABASE_URL=postgresql://username:password@hostname:5432/database_name

# Example with Neon, Supabase, or other hosted PostgreSQL
DATABASE_URL=postgresql://user:pass@ep-cool-darkness-123456.us-east-1.aws.neon.tech/neondb
```

### For Google Cloud Run Deployment

```bash
# Cloud SQL Unix Socket connection
DATABASE_URL=postgresql://username:password@/database_name?host=/cloudsql/project-id:region:instance-name

# Example
DATABASE_URL=postgresql://myuser:mypass@/mydatabase?host=/cloudsql/my-project:us-central1:my-instance
```

## Local Development

### Option 1: Direct TCP Connection (Recommended)

Use a cloud PostgreSQL service like Neon, Supabase, or Railway:

```bash
# .env file
DATABASE_URL=postgresql://user:password@your-cloud-db.com:5432/database
```

### Option 2: Local PostgreSQL

```bash
# Install PostgreSQL locally
# macOS
brew install postgresql
brew services start postgresql

# Create database and user
createdb your_app_db
createuser your_app_user

# .env file
DATABASE_URL=postgresql://your_app_user:password@localhost:5432/your_app_db
```

### Option 3: Cloud SQL Proxy (for testing Cloud SQL locally)

```bash
# Install Cloud SQL Proxy
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.0.0/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy

# Start proxy (replace with your instance details)
./cloud-sql-proxy --unix-socket=/tmp/cloudsql your-project:your-region:your-instance

# .env file
DATABASE_URL=postgresql://username:password@/database?host=/tmp/cloudsql/your-project:your-region:your-instance
```

## Testing

### Unit Tests

```bash
# Run unit tests (no database required)
npm test server/db.test.ts
```

### Integration Tests

```bash
# TCP connection testing (Replit-style)
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/testdb npm test server/db-integration.test.ts

# Cloud SQL testing (requires Cloud SQL Proxy or actual Cloud SQL)
TEST_CLOUDSQL_URL=postgresql://user:pass@/testdb?host=/cloudsql/project:region:instance npm test server/db-integration.test.ts
```

### Running All Tests

```bash
# Set environment variables and run tests
export TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/testdb
npm test
```

## Deployment

### Replit Deployment

1. Set the `DATABASE_URL` environment variable in Replit Secrets:
   ```
   DATABASE_URL=postgresql://user:password@host:5432/database
   ```

2. Deploy normally - the app will detect TCP mode automatically.

### Google Cloud Run Deployment

1. Create a Cloud SQL instance:
   ```bash
   gcloud sql instances create my-instance \
     --database-version=POSTGRES_15 \
     --tier=db-f1-micro \
     --region=us-central1
   ```

2. Create database and user:
   ```bash
   gcloud sql databases create mydatabase --instance=my-instance
   gcloud sql users create myuser --instance=my-instance --password=mypassword
   ```

3. Deploy to Cloud Run with Cloud SQL connection:
   ```bash
   gcloud run deploy real-estate-app \
     --source . \
     --platform managed \
     --region us-central1 \
     --add-cloudsql-instances=PROJECT_ID:us-central1:my-instance \
     --set-env-vars="DATABASE_URL=postgresql://myuser:mypassword@/mydatabase?host=/cloudsql/PROJECT_ID:us-central1:my-instance"
   ```

## Database Schema Migration

The Drizzle schema remains unchanged. Run migrations as before:

```bash
# Push schema changes
npm run db:push

# Generate migrations (if using migration files)
npx drizzle-kit generate:pg
```

## Monitoring and Debugging

### Connection Info

The app provides connection debugging information:

```typescript
import { getConnectionInfo, testConnection } from './server/db';

// Check connection status
const isConnected = await testConnection();
console.log('Database connected:', isConnected);

// Get connection details
const info = getConnectionInfo();
console.log('Connection info:', info);
```

### Logs

The application logs connection details on startup:

```
🔌 Configuring database for Replit/TCP connection
✅ Database connection successful
```

or

```
🔌 Configuring database for Google Cloud Run (Unix Socket)
✅ Database connection successful
```

## Troubleshooting

### Common Issues

1. **Path resolution error** (from your original logs):
   - This was caused by the `@neondatabase/serverless` import issue
   - Fixed by switching to standard `pg` library

2. **Connection timeout on Cloud Run**:
   - Ensure Cloud SQL instance is in the same region
   - Verify the Cloud SQL connection annotation in Cloud Run
   - Check that the database user has proper permissions

3. **SSL errors with TCP connections**:
   - Most cloud PostgreSQL providers require SSL
   - The app automatically enables SSL for production TCP connections

4. **Unix socket permission errors**:
   - Ensure the Cloud Run service account has Cloud SQL Client role
   - Verify the socket path format is correct

### Debug Mode

Enable debug logging by setting:

```bash
DEBUG=1 npm start
```

This will provide detailed connection configuration and query logging.

## Performance Considerations

### Connection Pooling

- **Replit**: Pool size of 20 connections (suitable for longer-running processes)
- **Cloud Run**: Pool size of 10 connections (optimized for serverless)

### Connection Lifecycle

- Idle connections are closed after 30 seconds
- Connection timeout is set to 10 seconds
- Graceful shutdown handlers ensure proper pool cleanup

### Best Practices

1. Always use the exported `db` instance for queries
2. Don't create additional pools
3. Use the `testConnection()` function during app startup
4. Monitor connection pool metrics in production

## Migration from @neondatabase/serverless

If migrating from the previous setup:

1. Update imports:
   ```typescript
   // Old
   import { Pool } from '@neondatabase/serverless';
   import { drizzle } from 'drizzle-orm/neon-serverless';

   // New
   import { Pool } from 'pg';
   import { drizzle } from 'drizzle-orm/node-postgres';
   ```

2. Remove WebSocket configuration:
   ```typescript
   // Remove these lines
   import ws from "ws";
   neonConfig.webSocketConstructor = ws;
   ```

3. Update package.json dependencies as shown above

4. Test both environments to ensure compatibility

## Support

For issues specific to:
- **Replit**: Check Replit's PostgreSQL documentation
- **Google Cloud SQL**: Refer to [Cloud SQL documentation](https://cloud.google.com/sql/docs/postgres)
- **Drizzle ORM**: See [Drizzle documentation](https://orm.drizzle.team/docs/overview)
# ResidentHive Local Development Setup Instructions

## Prerequisites
- Docker Desktop installed and running
- Node.js 18+ installed

## Setup Steps

### 1. Pull Latest Changes
```bash
git pull origin feat/clerk-auth-integration
```

### 2. Start PostgreSQL Database
```bash
docker-compose -f docker-compose.dev.yml up -d postgres
```
Wait 5-10 seconds for the database to be ready.

### 3. Create Your Local Environment File
Create a `.env.local` file with these contents:
```env
NODE_ENV=development
DATABASE_URL=postgresql://residenthive:localdev123@localhost:5432/residenthive_dev
PGPASSWORD=localdev123
OPENAI_API_KEY=your_openai_key_here
REPLIERS_API_KEY=your_repliers_key_here
TAVILY_API_KEY=your_tavily_key_here
SESSION_SECRET=super-secret-session-key
JWT_SECRET=local-dev-secret-key-2024
APP_URL=http://localhost:3000
PORT=3000
EMAIL_FROM=test@localhost.com
EMAIL_REPLY_TO=test@localhost.com
USE_ENHANCED_STRATEGY=true
USE_ENHANCED_EXTRACTION=true
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_key
CLERK_SECRET_KEY=your_clerk_secret
```

### 4. Install Dependencies
```bash
npm install
```

### 5. Setup Database Tables (First Time Only)
```bash
# Copy .env.local to .env temporarily for migrations
cp .env.local .env

# Run migrations
npm run db:migrate

# Or if that fails, use:
npx drizzle-kit push --force
```

### 6. Start Development Server
```bash
npx tsx -r dotenv/config server/index.ts dotenv_config_path=.env.local
```

The app will be available at **http://localhost:3000**

## What's New?
- **No more WebSocket errors!** The database connection now auto-detects local vs production environment
- Local development uses standard PostgreSQL connection
- Production uses Neon WebSocket connection
- You'll see `📦 Using local PostgreSQL connection` in the console

## Troubleshooting

**Port 5432 already in use?**
```bash
docker stop $(docker ps -q --filter ancestor=postgres)
docker-compose -f docker-compose.dev.yml up -d postgres
```

**Port 3000 already in use?**
```bash
lsof -ti:3000 | xargs kill -9
```

**Need to reset the database?**
```bash
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d postgres
cp .env.local .env && npx drizzle-kit push --force
```

## Daily Development Workflow
1. Make sure Docker is running
2. Start the database: `docker-compose -f docker-compose.dev.yml up -d postgres`
3. Run the dev server: `npx tsx -r dotenv/config server/index.ts dotenv_config_path=.env.local`
4. Code away! 🚀

## Quick Commands Reference
```bash
# Start everything
docker-compose -f docker-compose.dev.yml up -d postgres
npx tsx -r dotenv/config server/index.ts dotenv_config_path=.env.local

# Stop everything
Ctrl+C (stop server)
docker-compose -f docker-compose.dev.yml down

# View logs
docker logs residenthive-db

# Connect to database
PGPASSWORD=localdev123 psql -h localhost -U residenthive -d residenthive_dev
```
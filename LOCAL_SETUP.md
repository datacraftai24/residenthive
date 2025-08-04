# Local Development Setup Guide

This guide will help you set up ResidentHive for local development with minimal configuration.

## Prerequisites

1. **Node.js 18+** - [Download](https://nodejs.org/)
2. **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop)
3. **Repliers API Key** - Required for property data

## Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone [your-repo-url]
cd residenthive

# Run the setup script
./setup-local.sh
```

The setup script will:
- ✅ Check prerequisites
- ✅ Create .env file from template
- ✅ Start PostgreSQL in Docker
- ✅ Install npm dependencies
- ✅ Initialize database schema

### 2. Configure API Keys

Edit the `.env` file and add your API keys:

```env
# Required - for property data
REPLIERS_API_KEY=your_actual_repliers_key

# Optional - for enhanced AI features
OPENAI_API_KEY=your_openai_key  # Remove if not using
```

### 3. Start Development

```bash
npm run dev
```

Open http://localhost:5000 in your browser.

## Manual Setup (Alternative)

If you prefer to set up manually:

```bash
# 1. Copy environment template
cp .env.local .env

# 2. Start PostgreSQL
docker-compose up -d

# 3. Install dependencies
npm install

# 4. Initialize database
npm run db:push

# 5. Start development server
npm run dev
```

## Database Management

### View Database
```bash
# Connect to PostgreSQL
docker exec -it residenthive-db psql -U residenthive -d residenthive_dev

# Common commands:
\dt          # List tables
\d agents    # Describe table
\q           # Quit
```

### Reset Database
```bash
# Stop and remove all data
docker-compose down -v

# Start fresh
docker-compose up -d
npm run db:push
```

## Testing Features

### 1. Basic Flow (No OpenAI needed)
- Create buyer profiles
- Search properties (uses Repliers API)
- View basic property matches

### 2. Enhanced Features (Requires OpenAI)
- Visual property analysis
- Advanced NLP for profile extraction
- Enhanced scoring with image intelligence

### 3. Agent System
- Process agent invites: `POST /api/agents/process-invites`
- Setup agent accounts
- Test authentication flow

## Troubleshooting

### Port Already in Use
```bash
# Check what's using port 5432
lsof -i :5432

# Change PostgreSQL port in docker-compose.yml if needed
```

### Database Connection Failed
```bash
# Check if PostgreSQL is running
docker ps

# Check logs
docker logs residenthive-db
```

### API Key Issues
- Ensure REPLIERS_API_KEY is valid
- OpenAI features will gracefully degrade if key is missing
- Check browser console for API errors

## Development Workflow

1. **Backend changes**: Auto-reloads with tsx
2. **Frontend changes**: Hot module replacement with Vite
3. **Database changes**: Run `npm run db:push` after schema updates

## Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run build           # Build for production
npm run check           # TypeScript check

# Database
npm run db:push         # Update schema
docker-compose logs     # View PostgreSQL logs

# Testing
curl http://localhost:5000/health  # Health check
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection (auto-configured) |
| REPLIERS_API_KEY | Yes | Property data API |
| OPENAI_API_KEY | No | AI features (falls back if missing) |
| SENDGRID_API_KEY | No | Email service (logs to console if missing) |

## Next Steps

1. Create a buyer profile through the UI
2. Test property search functionality
3. Explore enhanced search with OpenAI (if configured)
4. Test agent invite system

---

**Note**: This setup uses Docker only for PostgreSQL. The application runs natively for the best development experience.
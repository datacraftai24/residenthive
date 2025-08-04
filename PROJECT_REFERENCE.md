# ResidentHive Project Reference

*Last Updated: 2025-08-04*

## Project Overview

ResidentHive is an AI-powered real estate buyer profile management system that helps agents create intelligent buyer profiles, find property matches, and provide exceptional client experiences.

## Technology Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Routing**: Wouter
- **Icons**: Lucide React
- **Forms**: React Hook Form with Zod validation

### Backend
- **Runtime**: Node.js 18+ with Express.js
- **Language**: TypeScript (ES modules)
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Passport.js with bcrypt
- **Session Management**: express-session with connect-pg-simple
- **Email**: SendGrid
- **File Uploads**: Built-in Express handling

### AI/ML Services
- **OpenAI**: GPT-4o for NLP and Vision analysis
- **Anthropic**: Claude SDK (optional)
- **Future**: Gemini integration planned

### External APIs
- **Repliers API**: Real estate MLS data (required)
- **SendGrid**: Email delivery (optional)

## Project Structure

```
residenthive/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/        # Route pages
│   │   ├── hooks/        # Custom React hooks
│   │   └── lib/          # Utilities
│   └── index.html
├── server/                # Express backend
│   ├── services/         # Business logic services
│   ├── email-*.ts        # Email related modules
│   ├── agent-*.ts        # Agent system modules
│   ├── routes.ts         # API endpoints
│   └── index.ts          # Server entry point
├── shared/               # Shared types and schemas
│   └── schema.ts         # Database schema & types
├── config/               # Configuration files
│   └── agents.yaml       # Agent configuration
└── deployment/           # Deployment guides

```

## Key Features

### 1. Buyer Profile Management
- AI-powered profile extraction from text/voice input
- Behavioral tagging and persona analysis
- Version tracking for profile changes
- Confidence scoring system

### 2. Property Search & Matching
- **Basic Search**: Traditional matching with Repliers API
- **Enhanced Search**: AI visual analysis with GPT-4 Vision
- **Dual-View Search**: Market Overview + AI Recommendations
- **NLP Search**: Natural language property queries

### 3. Agent System
- Secure authentication with token-based invites
- Agent-specific data isolation
- Professional email invitations
- Agent dashboard with analytics

### 4. Chat Service (New)
- Multi-agent AI chat system
- Property interaction tracking
- AI-generated insights for agents
- Chat-to-search context linking

### 5. Sharing & Communication
- Shareable property links (Zillow-style)
- WhatsApp/Email formatted messages
- Agent branding on shared content

## Database Schema

### Core Tables
- `agents` - Agent accounts and authentication
- `buyerProfiles` - Buyer information and preferences
- `profileTags` - AI-generated behavioral tags
- `profilePersona` - Deep persona analysis
- `searchTransactions` - Search history and analytics
- `cachedSearchResults` - Performance optimization

### Chat Service Tables
- `chatSessions` - Client conversation tracking
- `chatMessages` - Chat interactions with AI analysis
- `propertyNotes` - Client notes on properties
- `propertyInteractions` - Likes/dislikes/favorites
- `chatAgentInsights` - AI insights for agents
- `chatSearchContext` - Links chat to searches

### Additional Tables
- `agentInsightFeedback` - Feedback on AI insights
- `agentActionFeedback` - Track agent actions
- `visualAnalysis` - Cached image analysis
- `nlpSearchLogs` - Natural language search tracking

## API Endpoints

### Authentication
- `POST /api/agents/login` - Agent login
- `POST /api/agents/setup-password` - Complete registration
- `POST /api/agents/invite` - Send agent invitation
- `GET /api/agents/validate-token` - Validate invite token

### Buyer Profiles
- `GET /api/buyer-profiles` - List profiles (agent-specific)
- `POST /api/buyer-profiles` - Create profile
- `GET /api/buyer-profiles/:id` - Get specific profile
- `PUT /api/buyer-profiles/:id` - Update profile
- `DELETE /api/buyer-profiles/:id` - Delete profile

### AI Processing
- `POST /api/extract-profile` - Extract profile from text
- `POST /api/enhanced-extraction` - Enhanced extraction with tags
- `POST /api/generate-tags` - Generate behavioral tags
- `POST /api/analyze-persona` - Deep persona analysis

### Property Search
- `POST /api/listings/search` - Basic property search
- `POST /api/listings/search-enhanced` - AI-enhanced search
- `POST /api/agent/search-properties` - Dual-view agent search
- `POST /api/agent/nlp-search` - Natural language search

### Chat Service
- `POST /api/chat/validate-context` - Validate chat session
- `GET /api/chat/session/:sessionId` - Get chat session
- `POST /api/chat/message` - Send chat message
- `POST /api/chat/property-interaction` - Track property interaction

## Environment Variables

### Required
```env
DATABASE_URL=postgresql://user:pass@host:port/db
REPLIERS_API_KEY=your_repliers_key
```

### Optional but Recommended
```env
OPENAI_API_KEY=your_openai_key
SENDGRID_API_KEY=your_sendgrid_key
FROM_EMAIL=noreply@yourdomain.com
BASE_URL=https://yourdomain.com
```

### Development
```env
NODE_ENV=development
PORT=5000
```

## Local Development Setup

### Quick Start
```bash
# 1. Run setup script
./setup-local.sh

# 2. Configure .env file
cp .env.local .env
# Edit .env with your API keys

# 3. Start development
npm run dev
```

### Manual Setup
```bash
# Start PostgreSQL
docker-compose up -d

# Install dependencies
npm install

# Initialize database
npm run db:push

# Start dev server
npm run dev
```

## Key Services

### RepliersService (`server/services/repliers-service.ts`)
Centralized service for all Repliers API interactions:
- `searchProperties()` - Broad market search
- `searchTargetedProperties()` - Filtered property search
- `executeNLPSearch()` - Natural language search
- Handles authentication, error handling, and response transformation

### AgentSearchService (`server/services/agent-search-service.ts`)
Orchestrates dual-view property search:
- Market Overview - Broad search with basic scoring
- AI Recommendations - Targeted search with visual analysis
- Parallel execution for performance

### EmailService (`server/email-service.ts`)
Handles all email communications:
- Agent invitations
- Welcome emails
- Password reset (future)
- Graceful fallback when SendGrid not configured

## Security Features

1. **Authentication**
   - bcrypt password hashing
   - Secure token generation for invites
   - Session-based authentication

2. **Data Isolation**
   - Agent-specific data access
   - Profile ownership validation
   - Cross-agent protection

3. **API Security**
   - CORS configuration
   - Rate limiting (planned)
   - Input validation with Zod

## Deployment Options

### 1. Replit
- Quick deployment with included static IP
- Integrated PostgreSQL
- Auto-scaling available

### 2. Google Cloud Run
- Production-scale infrastructure
- Cloud SQL PostgreSQL
- Custom domain support
- Auto-scaling based on demand

### 3. Docker
- Production Dockerfile included
- Multi-stage build for optimization
- Health checks configured

## Common Tasks

### Add New Agent
```yaml
# config/agents.yaml
agents:
  - firstName: "John"
    lastName: "Doe"
    email: "john@realty.com"
    brokerageName: "ABC Realty"
```

Then run: `POST /api/agents/process-invites`

### Reset Database
```bash
docker-compose down -v
docker-compose up -d
npm run db:push
```

### View Logs
```bash
# PostgreSQL logs
docker-compose logs postgres

# Application logs
# Check console output or use logging service
```

## Recent Updates (2025-08-04)

1. **Dual-View Search System** - Complete implementation with centralized API service
2. **Chat Service Integration** - Multi-agent AI chat with 6 new database tables
3. **NLP Search** - Natural language property search with Repliers NLP API
4. **Enhanced Security** - Fixed cross-agent token issues, improved data isolation
5. **Deployment Improvements** - Better environment handling, conditional module loading

## Known Issues & Limitations

1. **Repliers API** - Required for all property data (no mock data)
2. **Image Analysis** - Requires OpenAI API key for enhanced features
3. **Email Delivery** - Requires SendGrid configuration and domain verification
4. **Static IP** - Required for Repliers API whitelisting in production

## Future Enhancements

1. **Gemini Integration** - Alternative AI provider support
2. **Mobile App** - React Native client
3. **Advanced Analytics** - ML-based insights
4. **Webhook Support** - Real-time notifications
5. **API Rate Limiting** - Production security

## Support & Documentation

- **Email Setup**: `EMAIL_SETUP_GUIDE.md`
- **Agent System**: `AGENT_INVITE_SETUP.md`
- **Database Setup**: `DATABASE_SETUP.md`
- **Local Development**: `LOCAL_SETUP.md`
- **Search Logic**: `SEARCH_LOGIC_FLOW.md`
- **AI Insights**: `AI_INSIGHTS_GUIDE.md`

## Contact

- **GitHub**: datacraftai24/residenthive
- **Support Email**: info@datacraftai.com
- **Brokerage**: DataCraft AI

---

*This reference document should be updated whenever significant changes are made to the project architecture, features, or configuration.*
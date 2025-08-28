Insert space and write text here
### Development Guidelines

- **Change Management**: Ensure all code changes are reviewed and approved before merging into the main branch. Implement proper version control protocols to track and manage code alterations effectively.

### Outstanding Issues

**Address Extraction System (Priority: High)**
- **Issue**: Investment reports still showing incomplete addresses (missing city/ZIP codes)
- **Status**: Code fixes implemented in `server/repliers-api.ts` and `server/agents/deal-packager.ts` but addresses still not displaying correctly
- **Verified**: API returns correct data format (`{city: "Boston", state: "MA", zip: "02132"}`)
- **Next Steps**: Debug data flow from API through Property Hunter → Deal Packager → Report generation
- **Date**: 2025-08-08

# Real Estate Buyer Profile Management System

## Overview
This is a full-stack web application designed for real estate agents to efficiently capture and manage buyer profiles. It allows for input via text or voice, utilizes AI (OpenAI GPT-4o) to extract and structure buyer preferences, and stores this data in a PostgreSQL database. The system aims to streamline the initial client profiling process, enhance agent-client communication through intelligent search and messaging, and provide comprehensive tools for property matching and client engagement. Key capabilities include AI-powered behavioral analysis, persona insights, property versioning, and a client-focused dashboard with shareable listings. The business vision is to provide a robust, AI-driven platform that empowers real estate agents to better understand and serve their clients, ultimately leading to improved lead conversion and client satisfaction in a competitive market.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **UI Framework**: shadcn/ui components on Radix UI
- **Styling**: Tailwind CSS with CSS variables
- **State Management**: TanStack Query (React Query)
- **Routing**: Wouter
- **Voice Input**: Web Speech API

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL with Drizzle ORM (via Neon serverless)
- **AI Integration**: OpenAI GPT-4o for NLP and Vision API
- **Session Management**: Connect-pg-simple
- **Agent Management**: Secure authentication system with bcrypt hashing, token-based invites, and professional email integration (SendGrid)
- **Transaction Logging**: Comprehensive data collection for ML model training, including search inputs, results, execution metrics, agent interactions, and search outcomes across 6 new database tables.
- **Chat Service Integration**: Dedicated chat service schema (6 tables) with intelligent linking to search transactions, multi-agent AI support, property interaction tracking, and agent insight generation. Designed for pure ResidentHive database integration, relying solely on agent, buyer profiles, and search transaction data.
- **Multi-Agent Architecture**: Specialized agent system with 5 dedicated agents (Strategy Builder, Market Research, Property Hunter, Financial Calculator, Real Estate Advisor, Deal Packager) coordinated by Agent Orchestrator for comprehensive investment analysis including ADU potential and value-add opportunities.

### Key Components
- **Database Schema**: `buyerProfiles` (with versioning, input method, confidence), `profileTags` (AI-generated behavioral tags with confidence and source), `profilePersona` (deep persona analysis: emotionalTone, communicationStyle, decisionMakingStyle, urgencyLevel, personalityTraits). New tables for agent management and chat service.
- **API Endpoints**: Comprehensive set for profile extraction (basic/enhanced), tag/persona analysis, buyer profile CRUD operations (including versioning), and agent invite/setup/login. Secure `/api/validate-context` for chat integration. **NEW**: Multi-agent analysis endpoints (`/api/multi-agent/*`) for comprehensive investment analysis with ADU potential and value-add strategies.
- **AI Processing**: GPT-4o for structured data extraction, behavioral analysis, persona insights, and visual intelligence (image analysis). Data validation via Zod schemas.
- **Multi-Agent System**: 
  - **Strategy Builder Agent**: Investment criteria analysis with real estate agent insights integration
  - **Market Research Agent**: Real-time market intelligence using Tavily API with university, transit, and development factor analysis
  - **Property Hunter Agent**: Multi-criteria property discovery with strategic scoring and geographic expansion
  - **Financial Calculator Agent**: Comprehensive scenario modeling (25%, 30%, 40% down payment options) with total economic benefit calculations
  - **Real Estate Advisor Agent**: ADU potential analysis (basement conversion feasibility, cost estimation $80k-$120k, rental income projection), value-add opportunity identification, zoning compliance assessment
  - **Deal Packager Agent**: Professional investment report generation with detailed calculation walkthroughs and PDF export capability
  - **Agent Orchestrator**: Coordinates all agents for comprehensive analysis workflow prioritizing accuracy over speed
- **Scoring System**: Smart Listing Scoring System (0-100 scale) with weighted components (Feature_Match, Budget_Match, Bedroom_Match, Location_Match, Visual_Tag_Match, Behavioral_Tag_Match, Listing_Quality_Score), penalties, and a visual boost. Features a defensive scoring utility for robust display.
- **Messaging System**: Two-tier professional agent messaging with AI transparency labels, editable AI assessments, "Generate Personal Message" feature, and engaging, scannable property assessments using emojis.
- **Shareable System**: Client-focused shareable profile dashboards (Zillow-like) displaying all property matches for a buyer profile in one link, with agent branding, WhatsApp/email sharing, and authentic MLS images via CDN.
- **Centralized API Architecture**: All Repliers API interactions consolidated in RepliersService (`server/services/repliers-service.ts`) with dedicated methods for broad search, targeted search, NLP API calls, and search execution. AgentSearchService (`server/services/agent-search-service.ts`) orchestrates dual-view functionality with parallel execution for optimal performance.
- **Repliers API Integration**: Fully corrected implementation based on Smart Rules documentation using proper parameter names (`minPrice/maxPrice`, `propertyType`, `status`, `type`), GET requests with Bearer authentication, and explicit sale property filtering to eliminate rental listings and ensure realistic purchase price data.

### System Design Choices
- **Monorepo Structure**: Client, server, and shared code separation.
- **Data Flow**: Input capture (text/voice) -> AI processing -> Validation -> Preview -> Storage -> Retrieval.
- **Hybrid Search**: Immediate property display with AI visual analysis on top 3 matches for optimized response times.
- **MLS Image Access**: Integration with Repliers CDN for accessible property images.
- **Security**: Robust agent authentication with bcrypt hashing, token-based invites, and comprehensive end-to-end testing, including critical security fixes for cross-agent token leakage. Data isolation enforced for agents and buyers in chat link generation.
- **Scalability**: Designed for multi-service architecture with shared authentication, profiles, and property data.

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: Neon PostgreSQL client
- **drizzle-orm**: Type-safe SQL query builder and ORM
- **openai**: Official OpenAI API client for GPT-4o
- **@tanstack/react-query**: Server state management
- **SendGrid**: For professional email services (agent invites)

### UI Dependencies
- **@radix-ui/***: UI primitives
- **tailwindcss**: CSS framework
- **lucide-react**: Icon library
- **wouter**: Routing library

### Development Dependencies
- **vite**: Build tool and dev server
- **tsx**: TypeScript execution engine
- **esbuild**: JavaScript bundler
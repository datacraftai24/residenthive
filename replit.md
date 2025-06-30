# Real Estate Buyer Profile Management System

## Overview

This is a full-stack web application for capturing and managing real estate buyer profiles. The system allows users to input buyer preferences through text or voice input, uses AI (OpenAI GPT-4o) to extract structured data, and saves profiles to a database. The application features a modern UI built with React and shadcn/ui components, with a Node.js/Express backend.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Wouter for lightweight client-side routing
- **Voice Input**: Web Speech API for speech-to-text functionality

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon serverless PostgreSQL
- **AI Integration**: OpenAI GPT-4o for natural language processing
- **Session Management**: Connect-pg-simple for PostgreSQL session storage

### Development Setup
- **Monorepo Structure**: Client, server, and shared code in separate directories
- **Hot Reload**: Vite dev server with HMR for frontend
- **Development Mode**: tsx for running TypeScript server code directly
- **Build Process**: Vite for frontend, esbuild for backend bundling

## Key Components

### Enhanced Database Schema (`shared/schema.ts`)
- **buyerProfiles Table**: Core buyer profile data with versioning
  - id (serial primary key)
  - name, email, budget, location, bedrooms, bathrooms
  - mustHaveFeatures and dealbreakers (JSON arrays)
  - inputMethod ('form', 'voice', 'text'), nlpConfidence (0-100)
  - version, parentProfileId (for profile evolution tracking)
  - rawInput (original user input), createdAt timestamp

- **profileTags Table**: AI-generated behavioral tags
  - id, profileId (foreign key), tag, category
  - confidence score (0-100), source ('ai_inference', 'form_data', 'manual')
  - Categories: demographic, behavioral, preference, urgency, financial

- **profilePersona Table**: Deep persona analysis
  - id, profileId (foreign key)
  - emotionalTone, communicationStyle, decisionMakingStyle
  - urgencyLevel (0-100), priceOrientation, personalityTraits (array)
  - confidenceScore (overall persona confidence)

### Enhanced API Endpoints (`server/routes.ts`)
- **POST /api/extract-profile**: Basic profile extraction from raw text
- **POST /api/extract-profile-enhanced**: Advanced extraction with tags and persona analysis
- **POST /api/tag-engine/analyze**: Standalone microservice for behavioral analysis (reusable)
- **POST /api/buyer-profiles**: Saves buyer profiles with enhanced metadata
- **GET /api/buyer-profiles**: Retrieves all saved buyer profiles
- **GET /api/buyer-profiles/:id/enhanced**: Gets profile with tags and persona data
- **GET /api/buyer-profiles/:id/versions**: Retrieves all versions of a profile
- **DELETE /api/buyer-profiles/:id**: Removes specific buyer profile and associated data

### Frontend Components
- **ProfileForm**: Input form with text area and voice recording capabilities
- **ProfileDisplay**: Shows extracted profile data with save functionality
- **Sidebar**: Lists saved profiles with search and selection
- **VoiceInput**: Handles speech-to-text conversion using Web Speech API

### AI Processing (`server/openai.ts`)
- Uses GPT-4o model for natural language understanding
- Extracts structured data: name, budget, location, bedrooms, bathrooms, features, dealbreakers
- Validates extracted data against Zod schemas
- Handles missing information with reasonable defaults

## Data Flow

1. **Input Capture**: User provides buyer requirements via text input or voice recording
2. **AI Processing**: Raw input sent to OpenAI GPT-4o for structured data extraction
3. **Validation**: Extracted data validated using Zod schemas
4. **Preview**: Structured profile displayed to user for review
5. **Storage**: Confirmed profiles saved to PostgreSQL database
6. **Retrieval**: Saved profiles displayed in sidebar and can be selected for viewing

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: Neon PostgreSQL client with connection pooling
- **drizzle-orm**: Type-safe SQL query builder and ORM
- **openai**: Official OpenAI API client for GPT-4o integration
- **@tanstack/react-query**: Server state management and caching

### UI Dependencies
- **@radix-ui/***: Accessible, unstyled UI primitives
- **tailwindcss**: Utility-first CSS framework
- **lucide-react**: Consistent icon library
- **wouter**: Lightweight routing library

### Development Dependencies
- **vite**: Fast build tool and dev server
- **tsx**: TypeScript execution engine for development
- **esbuild**: Fast JavaScript bundler for production

## Deployment Strategy

### Development
- **Frontend**: Vite dev server on port 5173 with HMR
- **Backend**: Express server with tsx for TypeScript execution
- **Database**: Neon serverless PostgreSQL with connection pooling
- **Environment**: DATABASE_URL and OPENAI_API_KEY required

### Production Build
- **Frontend**: `vite build` outputs to `dist/public`
- **Backend**: `esbuild` bundles server code to `dist/index.js`
- **Static Assets**: Express serves built frontend from `dist/public`
- **Database**: Drizzle migrations applied via `db:push` command

### Configuration
- **Database Config**: `drizzle.config.ts` defines PostgreSQL connection and migration settings
- **Build Config**: `vite.config.ts` handles client build with path aliases
- **TypeScript**: Shared configuration across client, server, and shared directories

## Changelog

```
Changelog:
- June 29, 2025. Initial setup
- June 30, 2025. Enhanced with Tag Engine microservice, persona analysis, profile versioning, and transparency features
  - Added standalone Tag Engine for behavioral analysis and persona insights
  - Implemented profile versioning system for tracking buyer preference evolution
  - Added confidence scoring and input method tracking for transparency
  - Created enhanced API endpoints for comprehensive profile analysis
  - Built UI components for displaying tags, persona insights, and confidence scores
- June 30, 2025. Profile viewing and editing functionality
  - Fixed database storage createdAt timestamp issue - profiles now save successfully
  - Implemented clickable profile sidebar with navigation to detailed profile views
  - Added comprehensive profile editing forms with full feature support
  - Enhanced dashboard with dynamic view modes (home, profile view, edit mode)
  - Database operations now properly handle timestamp creation for all entities
- June 30, 2025. Conversational editing system and GitHub integration
  - Implemented AI-powered voice/text editing interface for hands-free profile updates
  - Added natural language change parsing with confidence scoring ("Change budget to $500K, add pool")
  - Created live preview system showing detected changes before applying
  - Integrated voice commands for real estate agents on calls or driving
  - Built quick edit shortcuts and edit history tracking
  - Successfully pushed complete codebase to GitHub repository
  - Configured secure GitHub PAT storage in vault for future deployments
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```
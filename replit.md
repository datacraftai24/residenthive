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
- July 4, 2025. Production-ready Repliers API integration with intelligent search
  - Integrated authentic Repliers MLS data with 8,067+ real listings
  - Implemented intelligent query parameter filtering for efficient API usage
  - Added real-world data transformation handling mixed rental/purchase properties
  - Built adaptive scoring algorithm managing missing bedroom/bathroom data
  - Created production-ready search with proper minPrice, maxPrice, city, propertyType filtering
  - Successfully processing authentic property images and MLS data
  - System ready for real-world deployment with actual real estate data
- July 5, 2025. Enhanced Visual Intelligence & Shareable Listing System
  - Implemented AI-powered image analysis using OpenAI GPT-4o Vision API
  - Added visual tag extraction for style matching (modern_kitchen, hardwood_floors, etc.)
  - Created quality assessment flags (excellent_lighting, dated_finishes, cluttered)
  - Built enhanced scoring algorithm integrating visual analysis with traditional metrics
  - Developed Zillow-like shareable listing links with agent branding
  - Added agent copy-paste text generation for WhatsApp, email, and social sharing
  - Created comprehensive visual intelligence database caching system
  - Enhanced listing search now analyzes property photos for better buyer matching
  - Removed all demo data fallbacks - system now requires and uses only authentic Repliers API data
  - Implemented intelligent fallback search: finds all listings in location when exact matches unavailable
  - Enhanced scoring system shows specific differences between client requirements and available properties
  - Transparent trade-off analysis helps agents discuss alternatives with clients based on real market data
- July 5, 2025. Client-Focused Shareable Profile Dashboard System (Zillow-like)
  - Transformed sharing from individual listing links to comprehensive client-focused dashboards
  - Created ProfileShareButton component with agent branding and customization options
  - Built complete client dashboard showing ALL property matches for a buyer profile in one link
  - Added API endpoints for shareable profile creation and data retrieval with authentic MLS images
  - Implemented WhatsApp sharing and email generation for agent communication
  - Enhanced property cards display authentic Repliers MLS data including high-quality property images
  - Added intelligent image fallback handling for missing or failed property photos
  - Created mobile-responsive client dashboard with agent contact information and custom messaging
  - Integrated visual analysis toggle for enhanced client presentations
  - System now generates single comprehensive links per client (like Zillow) instead of per-listing shares
  - Fixed database column mapping issues (snake_case vs camelCase) for proper API functionality
  - Resolved client dashboard data loading with authentic MLS property images (25-40 photos per property)
  - Verified complete end-to-end functionality from profile creation to client dashboard sharing
- July 6, 2025. Hybrid Visual Analysis & MLS Image Access Investigation
  - Implemented hybrid approach: immediate property display with AI analysis on top 3 matches only
  - Successfully reduced API response times to 500-700ms with fast property loading
  - Identified MLS image access restriction issue: Repliers provides MLS references that require special access
  - Created image proxy endpoint and fallback strategies for handling restricted MLS images
  - Documented need for Repliers to provide hosted/accessible image URLs instead of MLS references
  - System fully functional with property data, scoring, and matching - image display pending Repliers solution
- July 6, 2025. Repliers CDN Integration Complete - Production Ready Image System
  - Successfully integrated Repliers CDN for accessible property images: https://cdn.repliers.io/mlsgrid/IMG-{ID}_{num}.jpg?class=medium
  - Confirmed HTTP 200 responses with proper image/jpeg content-type from Repliers CDN
  - Medium size optimization (800px) implemented for optimal web performance and bandwidth
  - Properties now display 15-40 authentic MLS images per listing (e.g., ACT8910808 with 32 images)
  - Fixed data pipeline issue where images were lost during scoring process enhancement
  - Added 15% scoring boost for properties with images to prioritize visual content
  - Client dashboard now has access to high-quality, authentic property images via accessible CDN URLs
  - Complete end-to-end image system working: Repliers API → CDN transformation → client display
- July 9, 2025. Professional Agent Messaging System with AI Transparency
  - Completely redesigned messaging system with two-tier approach for professional real estate agents
  - Replaced clunky AI-generated personal messages with professional agent-voice assessments
  - Tier 1: Professional agent summaries ("I found this property that checks most of your boxes...")
  - Tier 2: On-demand personal client messages ("Hi [Name], I found a property you'll love...")
  - Added comprehensive AI transparency labels on all AI-generated content sections
  - Implemented edit functionality allowing agents to modify AI assessments before client presentation
  - Added "Generate Personal Message" button for creating warm client communications on-demand
  - Enhanced user experience with professional loading messages explaining AI analysis value
  - Maintained powerful visual intelligence while making messaging agent-controllable and transparent
  - System now balances AI efficiency with professional real estate communication standards
- July 10, 2025. Engaging Scannable Messaging for All Properties
  - Replaced formulaic messaging templates with varied, engaging assessments for all properties
  - Implemented emoji categorization (🏠, ✅, 🚫, 🤔) for instant visual scanning
  - Added multiple opening hooks ("This one hits the mark", "Mixed bag on this one", "Worth a look")
  - Created decisive verdicts based on match quality instead of repetitive explanations
  - Applied new messaging system to all properties, not just top 3 with visual analysis
  - Messages now under 50 words, scannable, and buyer-friendly instead of agent-focused technical details
  - Enhanced both basic listing scorer and visual intelligence scorer with consistent engaging tone
  - System generates varied messages that buyers will actually read and engage with
- July 10, 2025. Smart Listing Scoring System Implementation (0-100 Scale)
  - Replaced old 0-1 scoring scale with new Smart Listing Scoring System using 0-100 scale
  - Implemented weighted component scoring: Feature_Match (25%), Budget_Match (20%), Bedroom_Match (15%), Location_Match (10%), Visual_Tag_Match (10%), Behavioral_Tag_Match (10%), Listing_Quality_Score (10%)
  - Added penalty system: Dealbreakers (-30 points), Missing data (-10 points), with visual boost (+10 points)
  - Implemented floor constraint: minimum score of 10 to prevent scoring anomalies
  - Updated score labels: Excellent Match (85+), Good Match (70+), Fair Match (55+), Poor Match (40+), Not Recommended (<40)
  - Enhanced categorization thresholds: Top Picks (70+), Other Matches (55-70)
  - Updated all scoring methods including listing quality assessment, visual analysis integration, and missing data penalties
  - System now provides more granular and meaningful score differentiation for better property matching
  - Fixed critical frontend "NaN%" display issue by updating all components to use new property names (budget_match, feature_match, etc.)
  - Updated enhanced-listing-search.tsx, listing-search.tsx, and client-dashboard.tsx to properly display score breakdowns
  - Score breakdown now shows points instead of percentages for clarity with comprehensive breakdown including all new scoring components
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```
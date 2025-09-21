#!/bin/bash

# Script to start ResidentHive locally with Docker

echo "🚀 Starting ResidentHive Local Development Environment"
echo "======================================================"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    cp .env.example .env
    echo "📝 Please update .env with your API keys:"
    echo "   - OPENAI_API_KEY"
    echo "   - REPLIERS_API_KEY"
    echo "   - TAVILY_API_KEY (optional)"
    echo ""
    echo "Then run this script again."
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check for required API keys
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ OPENAI_API_KEY is not set in .env file"
    exit 1
fi

if [ -z "$REPLIERS_API_KEY" ]; then
    echo "❌ REPLIERS_API_KEY is not set in .env file"
    exit 1
fi

echo "✅ Environment variables loaded"

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.dev.yml down

# Build and start services
echo "🔨 Building services..."
docker-compose -f docker-compose.dev.yml build

echo "🚀 Starting services..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 5

# Run database migrations
echo "📊 Running database migrations..."
docker-compose -f docker-compose.dev.yml exec app npm run db:migrate

echo ""
echo "✅ ResidentHive is running!"
echo "======================================================"
echo "📱 Frontend: http://localhost:3000"
echo "🔌 Backend API: http://localhost:3001"
echo "🗄️  Database: postgresql://localhost:5432/residenthive_dev"
echo ""
echo "📝 To test the investment chat:"
echo "   1. Go to http://localhost:3000"
echo "   2. Create or select a buyer profile"
echo "   3. Click on 'Investment Strategy' tab"
echo ""
echo "🛑 To stop: docker-compose -f docker-compose.dev.yml down"
echo "📊 To view logs: docker-compose -f docker-compose.dev.yml logs -f"
echo "======================================================"
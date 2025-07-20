#!/bin/bash

# Setup script for ResidentHive Chatbot Integration
echo "Setting up ResidentHive Chatbot Integration..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 is not installed. Please install pip first."
    exit 1
fi

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip3 install -r requirements.txt

# Check if RealEstateIntelligence directory exists
if [ ! -d "../RealEstateIntelligence" ]; then
    echo "⚠️  RealEstateIntelligence directory not found at ../RealEstateIntelligence"
    echo "Please ensure the RealEstateIntelligence project is available in the parent directory."
    exit 1
fi

# Copy RealEstateIntelligence files to server directory
echo "📋 Copying RealEstateIntelligence files..."
cp -r ../RealEstateIntelligence/agent.py server/
cp -r ../RealEstateIntelligence/vector_store.py server/
cp -r ../RealEstateIntelligence/requirements.txt server/real_estate_requirements.txt

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "🔧 Creating .env file..."
    cat > .env << EOF
# OpenAI API Key (required for chatbot)
OPENAI_API_KEY=your_openai_api_key_here

# Python path (optional, defaults to python3)
PYTHON_PATH=python3
EOF
    echo "⚠️  Please update .env file with your OpenAI API key"
fi

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env file with your OpenAI API key"
echo "2. Start the development server: npm run dev"
echo "3. Navigate to /chat to test the chatbot" 
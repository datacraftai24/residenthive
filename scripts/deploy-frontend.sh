#!/bin/bash
set -e

# Frontend Deployment Script for Google Cloud Run
# This script builds and deploys the React frontend to Cloud Run

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-resident-hive-ai-agent-pilot}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="residenthive-frontend"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Backend URL (must be set or provided)
if [ -z "$BACKEND_URL" ]; then
    echo "Error: BACKEND_URL environment variable is not set"
    echo "Example: export BACKEND_URL=https://your-backend-service-url.run.app"
    exit 1
fi

echo "======================================"
echo "Deploying Frontend to Cloud Run"
echo "======================================"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service: ${SERVICE_NAME}"
echo "Backend URL: ${BACKEND_URL}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo "Error: Not authenticated with gcloud. Run: gcloud auth login"
    exit 1
fi

# Set the project
echo "Setting GCP project..."
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com

# Build the Docker image
echo "Building Docker image..."
cd frontend
gcloud builds submit --tag ${IMAGE_NAME}
cd ..

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300 \
  --set-env-vars "PORT=8080,VITE_BACKEND_URL=${BACKEND_URL},NODE_ENV=production"

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')

echo ""
echo "======================================"
echo "Frontend Deployment Complete!"
echo "======================================"
echo "Service URL: ${SERVICE_URL}"
echo ""
echo "Next steps:"
echo "1. Update backend CORS to allow: ${SERVICE_URL}"
echo "2. Test the application at: ${SERVICE_URL}"
echo "3. Configure custom domain (optional)"
echo ""

#!/bin/bash
set -e

# Location Service Deployment Script for Google Cloud Run
# This script builds and deploys the Location Intelligence microservice to Cloud Run

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-resident-hive-ai-agent-pilot}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="location-service"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "======================================"
echo "Deploying Location Service to Cloud Run"
echo "======================================"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service: ${SERVICE_NAME}"
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
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com secretmanager.googleapis.com

# Build the Docker image
echo "Building Docker image..."
cd backend/services/location-service
gcloud builds submit --tag ${IMAGE_NAME}:latest .
cd ../../..

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
# Note: Secrets must exist in Secret Manager: GEMINI_API_KEY, GOOGLE_MAPS_API_KEY
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:latest \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300 \
  --update-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest,GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_API_KEY:latest \
  --set-env-vars GEMINI_MODEL_LOCATION=gemini-2.5-flash

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)' 2>/dev/null || echo "")

echo ""
echo "======================================"
echo "Location Service Deployment Complete!"
echo "======================================"
if [ -n "$SERVICE_URL" ]; then
    echo "Service URL: ${SERVICE_URL}"
else
    echo "Service deployed but URL not yet available. Check Cloud Run console."
fi
echo ""
echo "Next steps:"
echo "1. Verify secrets in Secret Manager: GEMINI_API_KEY, GOOGLE_MAPS_API_KEY"
echo "2. Update backend LOCATION_SERVICE_URL environment variable to: ${SERVICE_URL}"
echo "3. Test the service health endpoint: ${SERVICE_URL}/health"
echo ""

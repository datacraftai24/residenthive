#!/bin/bash
set -e

# Backend Deployment Script for Google Cloud Run
# This script builds and deploys the FastAPI backend to Cloud Run

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-resident-hive-ai-agent-pilot}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="residenthive-backend"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "======================================"
echo "Deploying Backend to Cloud Run"
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
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com

# Build the Docker image using cloudbuild.yaml
echo "Building Docker image..."
cd backend
gcloud builds submit --config=cloudbuild.yaml
cd ..

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
# Note: Do NOT set PORT env var - Cloud Run sets this automatically
# Setting it will cause deployment failure with "reserved env names" error
# Using --max-instances 1 to ensure all requests hit the same container (for in-memory cache)
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 1 \
  --timeout 300 \
  --set-env-vars LOCATION_SERVICE_URL=https://location-service-971261331418.us-central1.run.app

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')

echo ""
echo "======================================"
echo "Backend Deployment Complete!"
echo "======================================"
echo "Service URL: ${SERVICE_URL}"
echo ""
echo "Next steps:"
echo "1. Set environment variables using: gcloud run services update ${SERVICE_NAME} --region ${REGION} --set-env-vars KEY=VALUE"
echo "2. Or use Secret Manager for sensitive data"
echo "3. Update frontend to use this backend URL"
echo ""

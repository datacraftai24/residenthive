# GCP Deployment Guide for Real Estate Buyer Profile System

## Prerequisites
1. Google Cloud Platform account
2. Billing enabled
3. gcloud CLI installed locally

## Setup Instructions

### 1. Create GCP Project
```bash
gcloud projects create real-estate-profiles --name="Real Estate Profiles"
gcloud config set project real-estate-profiles
```

### 2. Enable Required APIs
```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sql-component.googleapis.com
gcloud services enable compute.googleapis.com
```

### 3. Static IP Setup for Cloud Run
```bash
# Create a static IP
gcloud compute addresses create static-ip --global

# Get the IP address (provide this to Repliers for whitelisting)
gcloud compute addresses describe static-ip --global --format="value(address)"
```

### 4. Database Setup (Cloud SQL PostgreSQL)
```bash
# Create PostgreSQL instance
gcloud sql instances create real-estate-db \
    --database-version=POSTGRES_14 \
    --tier=db-f1-micro \
    --region=us-central1

# Create database
gcloud sql databases create buyer_profiles --instance=real-estate-db

# Create user
gcloud sql users create app-user --instance=real-estate-db --password=SECURE_PASSWORD
```

### 5. Environment Variables Setup
Create `.env.production` file:
```
DATABASE_URL=postgresql://app-user:SECURE_PASSWORD@/buyer_profiles?host=/cloudsql/PROJECT_ID:us-central1:real-estate-db
OPENAI_API_KEY=your_openai_key
REPLIERS_API_KEY=your_repliers_key
NODE_ENV=production
```

### 6. Build and Deploy
```bash
# Build Docker image
gcloud builds submit --tag gcr.io/real-estate-profiles/app

# Deploy to Cloud Run with static IP
gcloud run deploy real-estate-profiles \
    --image gcr.io/real-estate-profiles/app \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --add-cloudsql-instances real-estate-profiles:us-central1:real-estate-db \
    --set-env-vars NODE_ENV=production
```

## Cost Estimation
- Cloud Run: ~$10-50/month (depending on usage)
- Cloud SQL: ~$7-25/month (db-f1-micro tier)
- Static IP: $1.46/month
- **Total: ~$18-76/month**

## Benefits vs Replit VM
- ✅ Dedicated static IP for API whitelisting
- ✅ Better performance and scalability
- ✅ Professional-grade infrastructure
- ✅ Better monitoring and logging
- ✅ Custom domain support
- ✅ Auto-scaling based on demand
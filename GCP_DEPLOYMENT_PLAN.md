# Google Cloud Deployment Plan for ResidentHive

## Overview
Deploy the improved ResidentHive backend (with RESO-compliant Repliers API) and frontend to Google Cloud Run with Cloud SQL PostgreSQL database.

## Architecture
- **Backend**: FastAPI (Python 3.10) on Cloud Run - Port 8000
- **Frontend**: React + Vite on Cloud Run - Port 8080
- **Database**: Cloud SQL PostgreSQL 15
- **Project**: resident-hive-ai-agent-pilot (existing)
- **Region**: us-central1

## Deployment Steps

### Phase 1: Database Setup
1. **Create Cloud SQL PostgreSQL instance** (if not exists)
   - Version: PostgreSQL 15
   - Tier: db-f1-micro (can upgrade later)
   - Enable Cloud SQL Admin API

2. **Run database migrations**
   - Execute migrations 002-005 in order
   - Creates all tables, views, and indexes needed for chatbot integration

3. **Create database user and credentials**
   - Store in Google Secret Manager

### Phase 2: Backend Deployment
1. **Set up environment secrets**
   - DATABASE_URL (Cloud SQL connection string)
   - OPENAI_API_KEY
   - REPLIERS_API_KEY
   - TAVILY_API_KEY
   - CLERK_SECRET_KEY
   - JWT_SECRET
   - SESSION_SECRET

2. **Build and deploy backend**
   - Use existing script: `scripts/deploy-backend.sh`
   - Builds Docker image with improved Repliers API code
   - Deploys to Cloud Run with Cloud SQL connection
   - Configures memory (512Mi), CPU (1), autoscaling (0-10 instances)

3. **Configure environment variables**
   - PORT=8000
   - NODE_ENV=production
   - Link secrets from Secret Manager

### Phase 3: Frontend Deployment
1. **Deploy backend first** (frontend needs backend URL)

2. **Build and deploy frontend**
   - Use existing script: `scripts/deploy-frontend.sh`
   - Set BACKEND_URL from Phase 2
   - Set VITE_CLERK_PUBLISHABLE_KEY build arg
   - Deploys to Cloud Run

3. **Update backend CORS**
   - Add frontend Cloud Run URL to CORS allowed origins
   - Redeploy backend with updated CLOUD_RUN_FRONTEND_URL env var

### Phase 4: Database Migration
1. **Export local database** (if needed for testing data)
   ```bash
   pg_dump residenthive_dev > backup.sql
   ```

2. **Import to Cloud SQL** (optional - only if needed)
   - Use Cloud SQL import or psql connection

### Phase 5: Testing & Validation
1. Test backend health endpoint
2. Test frontend loads correctly
3. Verify database connectivity
4. Test Repliers API search with improved parameters
5. Verify AI recommendations and Market Overview work correctly

## What's Already Done
✅ Deployment scripts exist (`scripts/deploy-backend.sh`, `scripts/deploy-frontend.sh`)
✅ Dockerfiles configured for both backend and frontend
✅ Database migrations created (002-005)
✅ Health checks configured in Dockerfiles
✅ CORS configuration ready for production
✅ Improved Repliers API search code pushed to main branch

## What Needs to Be Done
1. Create/configure Cloud SQL instance
2. Set up Google Secret Manager with API keys
3. Run database migrations on Cloud SQL
4. Execute deployment scripts with proper environment variables
5. Update CORS configuration with deployed URLs

## Cost Estimate
- Cloud Run Backend: ~$5-20/month (0-10 instances, 512Mi)
- Cloud Run Frontend: ~$5-20/month (0-10 instances, 512Mi)
- Cloud SQL PostgreSQL: ~$7-25/month (db-f1-micro)
- **Total: ~$17-65/month**

## Deployment Commands

### 1. Set up GCP Project
```bash
export GCP_PROJECT_ID="resident-hive-ai-agent-pilot"
gcloud config set project $GCP_PROJECT_ID
```

### 2. Enable Required APIs
```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sql-component.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### 3. Create Cloud SQL Instance
```bash
gcloud sql instances create residenthive-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1

# Create database
gcloud sql databases create residenthive_prod --instance=residenthive-db

# Create user
gcloud sql users create residenthive \
  --instance=residenthive-db \
  --password=SECURE_PASSWORD_HERE
```

### 4. Create Secrets in Secret Manager
```bash
# Database URL
echo -n "postgresql://residenthive:PASSWORD@/residenthive_prod?host=/cloudsql/resident-hive-ai-agent-pilot:us-central1:residenthive-db" | \
  gcloud secrets create database-url --data-file=-

# OpenAI API Key
echo -n "YOUR_OPENAI_KEY" | gcloud secrets create openai-key --data-file=-

# Repliers API Key
echo -n "YOUR_REPLIERS_KEY" | gcloud secrets create repliers-key --data-file=-

# Tavily API Key
echo -n "YOUR_TAVILY_KEY" | gcloud secrets create tavily-key --data-file=-

# Clerk Secret Key
echo -n "YOUR_CLERK_KEY" | gcloud secrets create clerk-key --data-file=-

# JWT Secret
echo -n "YOUR_JWT_SECRET" | gcloud secrets create jwt-secret --data-file=-

# Session Secret
echo -n "YOUR_SESSION_SECRET" | gcloud secrets create session-secret --data-file=-
```

### 5. Deploy Backend
```bash
cd /Users/piyushtiwari/residenthive
export GCP_PROJECT_ID="resident-hive-ai-agent-pilot"
./scripts/deploy-backend.sh
```

### 6. Update Backend with Secrets
```bash
gcloud run services update residenthive-backend \
  --region us-central1 \
  --update-secrets DATABASE_URL=database-url:latest \
  --update-secrets OPENAI_API_KEY=openai-key:latest \
  --update-secrets REPLIERS_API_KEY=repliers-key:latest \
  --update-secrets TAVILY_API_KEY=tavily-key:latest \
  --update-secrets CLERK_SECRET_KEY=clerk-key:latest \
  --update-secrets JWT_SECRET=jwt-secret:latest \
  --update-secrets SESSION_SECRET=session-secret:latest \
  --add-cloudsql-instances resident-hive-ai-agent-pilot:us-central1:residenthive-db
```

### 7. Get Backend URL
```bash
export BACKEND_URL=$(gcloud run services describe residenthive-backend \
  --region us-central1 --format 'value(status.url)')
echo "Backend URL: $BACKEND_URL"
```

### 8. Deploy Frontend
```bash
export VITE_CLERK_PUBLISHABLE_KEY="your_clerk_publishable_key"
./scripts/deploy-frontend.sh
```

### 9. Get Frontend URL and Update Backend CORS
```bash
FRONTEND_URL=$(gcloud run services describe residenthive-frontend \
  --region us-central1 --format 'value(status.url)')
echo "Frontend URL: $FRONTEND_URL"

# Update backend with frontend URL for CORS
gcloud run services update residenthive-backend \
  --region us-central1 \
  --update-env-vars CLOUD_RUN_FRONTEND_URL=$FRONTEND_URL
```

## Next Steps
Ready to execute deployment when you approve!

# ResidentHive GCP Deployment Guide

Complete guide for deploying ResidentHive to Google Cloud Platform (Cloud Run).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Common Issues & Solutions](#common-issues--solutions)
3. [Pre-Deployment Checklist](#pre-deployment-checklist)
4. [Backend Deployment](#backend-deployment)
5. [Frontend Deployment](#frontend-deployment)
6. [Troubleshooting](#troubleshooting)
7. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### Required Tools

- **gcloud CLI**: [Install](https://cloud.google.com/sdk/docs/install)
- **Docker**: [Install](https://docs.docker.com/get-docker/)
- **Git**: Version control

### GCP Setup

```bash
# Authenticate with Google Cloud
gcloud auth login

# Set your project
gcloud config set project resident-hive-ai-agent-pilot

# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com
```

---

## Common Issues & Solutions

### Issue 1: Backend PORT Environment Variable Error

**Error Message**:
```
spec.template.spec.containers[0].env: The following reserved env names were provided: PORT
```

**Cause**: Trying to set `PORT` environment variable in Cloud Run deployment. Cloud Run automatically sets this variable.

**Solutions**:
1. **In `backend/Dockerfile`**:
   - ❌ Wrong: `CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}`
   - ✅ Correct: `CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT`

2. **In deployment scripts**:
   - ❌ Wrong: `--set-env-vars PORT=8000`
   - ✅ Correct: Remove the `--set-env-vars PORT=...` flag entirely

### Issue 2: Frontend Can't Connect to Backend (localhost:8000)

**Symptoms**:
- Frontend loads but shows no data
- Browser console shows connection errors to `localhost:8000`
- Frontend logs show: `Backend URL: http://localhost:8000`

**Cause**: `VITE_BACKEND_URL` not available at runtime in the production container.

**Solution**:
1. **In `frontend/Dockerfile`**, ensure production stage has the environment variable:
   ```dockerfile
   # Stage 2: Production server
   FROM node:18-alpine AS production
   # ... other setup ...

   # Add these lines:
   ARG VITE_BACKEND_URL=https://api.residencehive.com
   ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
   ```

2. **In `frontend/cloudbuild.yaml`**, pass as build arg:
   ```yaml
   args:
     - '--build-arg'
     - 'VITE_BACKEND_URL=https://api.residencehive.com'
   ```

3. **In deployment script**, do NOT override at runtime:
   - ❌ Wrong: `--set-env-vars VITE_BACKEND_URL=...`
   - ✅ Correct: Let it use the build-time value

### Issue 3: Stale Frontend Code in Production

**Symptoms**:
- Changes made locally don't appear in production
- Local Docker build works but production doesn't

**Cause**: Deploying an old image or image cached by Cloud Build.

**Solution**:
1. Always commit changes before deploying
2. Use Cloud Build to build fresh images (don't reuse local images)
3. Check deployed revision name to confirm new deployment
4. Clear browser cache and test in incognito mode

---

## Pre-Deployment Checklist

Run the automated pre-deployment checks:

```bash
./scripts/pre-deploy-check.sh
```

### Manual Checklist

- [ ] All changes committed to git
- [ ] Environment variables configured correctly
- [ ] Docker builds successfully locally
- [ ] Tests pass
- [ ] Database migrations applied
- [ ] Secrets stored in Secret Manager (not in code)
- [ ] CORS settings allow frontend domain
- [ ] API keys are valid and not expired

---

## Backend Deployment

### Method 1: Using Deployment Script (Recommended)

```bash
# From project root
./scripts/deploy-backend.sh
```

The script will:
1. Verify gcloud authentication
2. Enable required APIs
3. Build Docker image using Cloud Build
4. Deploy to Cloud Run
5. Output the service URL

### Method 2: Manual Deployment

```bash
# Navigate to backend directory
cd backend

# Build image with Cloud Build
gcloud builds submit --config=cloudbuild.yaml

# Deploy to Cloud Run
gcloud run deploy residenthive-backend \
  --image gcr.io/resident-hive-ai-agent-pilot/residenthive-backend:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300
```

### Post-Deployment Verification

```bash
# Get service URL
BACKEND_URL=$(gcloud run services describe residenthive-backend \
  --region us-central1 \
  --format 'value(status.url)')

# Test health endpoint
curl $BACKEND_URL/health

# Check logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=residenthive-backend" \
  --limit 50 \
  --format json
```

---

## Frontend Deployment

### Method 1: Using Deployment Script (Recommended)

```bash
# From project root
./scripts/deploy-frontend.sh
```

### Method 2: Manual Deployment

```bash
# Navigate to frontend directory
cd frontend

# Build image with Cloud Build (includes VITE_BACKEND_URL)
gcloud builds submit --config=cloudbuild.yaml

# Deploy to Cloud Run
gcloud run deploy residenthive-frontend \
  --image gcr.io/resident-hive-ai-agent-pilot/residenthive-frontend:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 10 \
  --timeout 300
```

### Post-Deployment Verification

```bash
# Get service URL
FRONTEND_URL=$(gcloud run services describe residenthive-frontend \
  --region us-central1 \
  --format 'value(status.url)')

# Open in browser
open $FRONTEND_URL

# Check frontend logs for backend URL
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=residenthive-frontend" \
  --limit 10 \
  --format json | jq -r '.[] | select(.textPayload | contains("Backend URL"))'
```

**Expected log output**:
```
Backend URL: https://api.residencehive.com
```

If you see `Backend URL: http://localhost:8000`, the deployment failed and you need to fix the Dockerfile.

---

## Troubleshooting

### Viewing Logs

```bash
# Backend logs (last 50 entries)
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=residenthive-backend" \
  --limit 50

# Frontend logs (last 50 entries)
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=residenthive-frontend" \
  --limit 50

# Tail logs in real-time
gcloud alpha run services logs tail residenthive-backend --region us-central1
```

### Check Deployed Revision

```bash
# List all revisions with traffic allocation
gcloud run revisions list \
  --service residenthive-backend \
  --region us-central1

# Get currently serving revision
gcloud run services describe residenthive-backend \
  --region us-central1 \
  --format 'value(status.latestReadyRevisionName,status.traffic[0].revisionName,status.traffic[0].percent)'
```

### Test Specific Revision

```bash
# Get revision URL
REVISION_URL=$(gcloud run revisions describe residenthive-backend-00018-tgp \
  --region us-central1 \
  --format 'value(status.url)')

# Test it
curl $REVISION_URL/health
```

### Common Error Messages

#### "Container failed to start"
- Check Dockerfile CMD is correct
- Verify all dependencies are installed
- Check logs for Python/Node errors

#### "502 Bad Gateway"
- Backend is crashing on startup
- Check environment variables are set
- Verify database connection

#### "403 Forbidden"
- Check IAM permissions
- Verify `--allow-unauthenticated` flag

#### "Cannot connect to backend"
- Frontend using wrong backend URL
- Check frontend logs for "Backend URL"
- Verify CORS settings

---

## Rollback Procedures

### Rollback to Previous Revision

```bash
# List revisions
gcloud run revisions list \
  --service residenthive-backend \
  --region us-central1

# Route 100% traffic to specific revision
gcloud run services update-traffic residenthive-backend \
  --to-revisions residenthive-backend-00017-xyz=100 \
  --region us-central1
```

### Emergency Rollback Script

```bash
#!/bin/bash
# rollback.sh
SERVICE=$1
REVISION=$2
REGION=us-central1

gcloud run services update-traffic $SERVICE \
  --to-revisions $REVISION=100 \
  --region $REGION

echo "Rolled back $SERVICE to $REVISION"
```

Usage:
```bash
./rollback.sh residenthive-backend residenthive-backend-00017-xyz
```

---

## Environment Variables

### Backend

Cloud Run automatically provides:
- `PORT` - Port to listen on (DO NOT SET MANUALLY)

Required (set in Secret Manager):
- Database credentials
- API keys
- OAuth secrets

### Frontend

Build-time (set in cloudbuild.yaml):
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_BACKEND_URL`

Runtime (set via Dockerfile):
- `NODE_ENV=production`
- `VITE_BACKEND_URL` (passed from build stage)

---

## Best Practices

1. **Always run pre-deployment checks**: `./scripts/pre-deploy-check.sh`
2. **Test locally first**: Build and run Docker containers locally
3. **Use Cloud Build**: Don't push local Docker images to GCR
4. **Monitor logs**: Watch logs during and after deployment
5. **Gradual rollout**: For major changes, route traffic gradually
6. **Keep revisions**: Don't delete old revisions immediately
7. **Document changes**: Update this guide when deployment process changes

---

## Quick Reference

### Deploy Everything

```bash
# Run pre-deployment checks
./scripts/pre-deploy-check.sh

# Deploy backend
./scripts/deploy-backend.sh

# Deploy frontend
./scripts/deploy-frontend.sh

# Verify deployment
curl https://api.residencehive.com/health
open https://residenthive-frontend-971261331418.us-central1.run.app
```

### Check Status

```bash
# Backend status
gcloud run services describe residenthive-backend --region us-central1

# Frontend status
gcloud run services describe residenthive-frontend --region us-central1

# Recent logs
gcloud alpha run services logs tail residenthive-backend --region us-central1
```

---

## Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Project README](./README.md)

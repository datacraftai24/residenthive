# ResidentHive - Google Cloud Run Deployment Guide

This guide covers deploying ResidentHive to Google Cloud Run with both frontend and backend as containerized services.

## Architecture

- **Frontend**: React + Vite application served via Express on Cloud Run
- **Backend**: FastAPI Python application on Cloud Run
- **Database**: Local PostgreSQL (or Cloud SQL for production)

## Prerequisites

1. **Google Cloud Project**
   - Project ID: `resident-hive-ai-agent-pilot` (or your project)
   - Billing enabled
   - APIs enabled: Cloud Run, Cloud Build, Container Registry

2. **Local Tools**
   - Docker installed
   - gcloud CLI installed and configured
   - PostgreSQL running locally (for development)

3. **Authentication**
   ```bash
   gcloud auth login
   gcloud config set project resident-hive-ai-agent-pilot
   ```

## Local Development with Docker

### Step 1: Set Up Environment Variables

Create a `.env` file in the root with your credentials:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your actual values
```

### Step 2: Run with Docker Compose

```bash
# Build and start all services
docker-compose up --build

# Services will be available at:
# - Frontend: http://localhost:8080
# - Backend: http://localhost:8000
# - PostgreSQL: localhost:5432
```

### Step 3: Stop Services

```bash
docker-compose down
```

## Deploying to Google Cloud Run

### Step 1: Deploy Backend First

```bash
# Run the backend deployment script
./scripts/deploy-backend.sh

# The script will:
# 1. Build the Docker image
# 2. Push to Google Container Registry
# 3. Deploy to Cloud Run
# 4. Output the backend URL
```

**Note the backend URL** from the output. You'll need it for the frontend deployment.

Example output:
```
Service URL: https://residenthive-backend-xxxx-uc.a.run.app
```

### Step 2: Set Backend Environment Variables

After deployment, configure environment variables:

```bash
# Using gcloud command
gcloud run services update residenthive-backend \
  --region us-central1 \
  --set-env-vars "DATABASE_URL=postgresql://user:pass@host:5432/db,OPENAI_API_KEY=sk-xxx,JWT_SECRET=your-secret"

# Or use Secret Manager (recommended for production)
# Create secrets first
gcloud secrets create openai-api-key --data-file=- <<< "your-key"
gcloud secrets create jwt-secret --data-file=- <<< "your-secret"

# Mount secrets to Cloud Run
gcloud run services update residenthive-backend \
  --region us-central1 \
  --set-secrets "OPENAI_API_KEY=openai-api-key:latest,JWT_SECRET=jwt-secret:latest"
```

### Step 3: Deploy Frontend

Update the frontend environment file with the backend URL:

```bash
# Edit frontend/.env.production
VITE_BACKEND_URL=https://residenthive-backend-xxxx-uc.a.run.app

# Deploy frontend
export BACKEND_URL=https://residenthive-backend-xxxx-uc.a.run.app
./scripts/deploy-frontend.sh
```

**Note the frontend URL** from the output.

### Step 4: Update Backend CORS

Add the frontend URL to backend's allowed origins:

```bash
# Get the frontend URL (example)
FRONTEND_URL=https://residenthive-frontend-xxxx-uc.a.run.app

# Update backend with frontend URL
gcloud run services update residenthive-backend \
  --region us-central1 \
  --set-env-vars "CLOUD_RUN_FRONTEND_URL=${FRONTEND_URL},NODE_ENV=production"
```

## Database Setup

### Option A: Local PostgreSQL with Cloud SQL Auth Proxy

If keeping the database local, set up Cloud SQL Auth Proxy:

1. **Install Cloud SQL Auth Proxy** on your local machine
2. **Configure proxy** to expose local PostgreSQL
3. **Set DATABASE_URL** in Cloud Run to point to the proxy

⚠️ **Warning**: This requires your local machine to be always running.

### Option B: Cloud SQL (Recommended for Production)

1. **Create Cloud SQL instance**:
   ```bash
   gcloud sql instances create residenthive-db \
     --database-version=POSTGRES_15 \
     --tier=db-f1-micro \
     --region=us-central1
   ```

2. **Create database**:
   ```bash
   gcloud sql databases create residenthive_prod \
     --instance=residenthive-db
   ```

3. **Create user**:
   ```bash
   gcloud sql users create residenthive \
     --instance=residenthive-db \
     --password=your-secure-password
   ```

4. **Connect Cloud Run to Cloud SQL**:
   ```bash
   gcloud run services update residenthive-backend \
     --region us-central1 \
     --add-cloudsql-instances resident-hive-ai-agent-pilot:us-central1:residenthive-db \
     --set-env-vars "DATABASE_URL=postgresql://residenthive:password@/residenthive_prod?host=/cloudsql/resident-hive-ai-agent-pilot:us-central1:residenthive-db"
   ```

## Testing Deployment

1. **Check backend health**:
   ```bash
   curl https://residenthive-backend-xxxx-uc.a.run.app/health
   ```

2. **Visit frontend**:
   ```bash
   open https://residenthive-frontend-xxxx-uc.a.run.app
   ```

3. **Monitor logs**:
   ```bash
   # Backend logs
   gcloud run logs tail residenthive-backend --region us-central1

   # Frontend logs
   gcloud run logs tail residenthive-frontend --region us-central1
   ```

## Environment Variables Reference

### Backend Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-proj-...` |
| `JWT_SECRET` | JWT signing secret | Random secure string |
| `FRONTEND_URL` | Frontend URL for CORS | `https://frontend-url.run.app` |
| `CLOUD_RUN_FRONTEND_URL` | Cloud Run frontend URL | `https://frontend-url.run.app` |
| `NODE_ENV` | Environment mode | `production` |

### Frontend Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_BACKEND_URL` | Backend API URL | `https://backend-url.run.app` |
| `PORT` | Server port | `8080` |

## Custom Domain Setup (Optional)

1. **Map domain to Cloud Run**:
   ```bash
   gcloud run domain-mappings create \
     --service residenthive-frontend \
     --domain app.yourdomain.com \
     --region us-central1
   ```

2. **Update DNS** with the provided records

3. **Wait for SSL certificate** to be provisioned automatically

## Troubleshooting

### Backend Issues

- **500 errors**: Check DATABASE_URL is correct
- **CORS errors**: Verify CLOUD_RUN_FRONTEND_URL is set
- **Timeout**: Increase timeout in Cloud Run settings

### Frontend Issues

- **API errors**: Check VITE_BACKEND_URL is correct
- **Build failures**: Ensure Node.js dependencies are installed

### Logs

```bash
# View recent logs
gcloud run logs tail residenthive-backend --region us-central1

# View specific request
gcloud run logs read residenthive-backend --region us-central1 --limit 50
```

## Cost Optimization

- Set `--min-instances=0` for both services (already configured)
- Use `--cpu=1` and `--memory=512Mi` for small workloads
- Monitor usage in Cloud Console
- Consider Cloud Run always-on pricing if traffic is consistent

## CI/CD Setup (Optional)

Create `.github/workflows/deploy.yml` for automated deployments on push to main.

## Security Considerations

1. ✅ Never commit `.env` files
2. ✅ Use Secret Manager for sensitive data
3. ✅ Configure proper CORS origins
4. ✅ Enable Cloud Armor for DDoS protection
5. ✅ Use Identity Platform for authentication
6. ✅ Enable Cloud SQL SSL connections

## Support

For issues or questions:
- Check logs in Cloud Console
- Review Cloud Run documentation
- Open an issue in the repository

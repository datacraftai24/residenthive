# Replit VM Deployment Guide

## Quick Setup for Static IP

### 1. Deploy to Replit VM
1. Click the "Deploy" button in your Replit interface
2. Select "Autoscale" deployment option
3. Configure environment variables:
   - `DATABASE_URL`: Your existing database URL
   - `OPENAI_API_KEY`: Your OpenAI key
   - `REPLIERS_API_KEY`: Your Repliers key

### 2. Get Static IP Address
Once deployed, Replit will provide you with:
- A static IP address for your deployment
- A custom domain (yourapp.replit.app)

### 3. Whitelist IP with Repliers
Contact Repliers support with:
- Your static IP address from Replit deployment
- Request to whitelist this IP for API access
- Mention you're building a real estate application

### 4. Verify Access
Test the Repliers API from your deployed application:
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     "https://api.repliers.io/listings?city=Austin&limit=5"
```

## Benefits of Replit VM
- ✅ Quick deployment (5 minutes)
- ✅ Static IP included
- ✅ Integrated with your existing Replit environment
- ✅ Automatic SSL certificates
- ✅ Built-in monitoring

## Limitations
- Limited customization compared to GCP
- Replit-specific infrastructure
- Less control over scaling and performance tuning

## Cost
- Replit Pro/Teams subscription required
- Typically $10-20/month depending on usage
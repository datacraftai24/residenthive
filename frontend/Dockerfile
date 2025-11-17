# Frontend Dockerfile for Vite + React application
# Multi-stage build for optimized production image

# Stage 1: Build the application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Accept build arguments
ARG VITE_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsucmVzaWRlbmNlaGl2ZS5jb20k
ARG VITE_BACKEND_URL=https://api.residencehive.com

# Copy source code
COPY . .

# Build the application with environment variables
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
RUN npm run build

# Stage 2: Production server
FROM node:18-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm install express

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy server file
COPY server.js ./

# Expose port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ARG VITE_BACKEND_URL=https://api.residencehive.com
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["node", "server.js"]

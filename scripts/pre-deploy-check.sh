#!/bin/bash
# Pre-Deployment Validation Script
# Run this before deploying to catch common configuration issues

set -e

echo "========================================="
echo "Pre-Deployment Validation"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Function to print colored messages
print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ((ERRORS++))
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

# Check 1: gcloud CLI installed and authenticated
echo "1. Checking gcloud CLI..."
if command -v gcloud &> /dev/null; then
    print_success "gcloud CLI is installed"
    if gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1)
        print_success "Authenticated as: $ACCOUNT"
    else
        print_error "Not authenticated with gcloud. Run: gcloud auth login"
    fi
else
    print_error "gcloud CLI is not installed"
fi
echo ""

# Check 2: Docker installed
echo "2. Checking Docker..."
if command -v docker &> /dev/null; then
    print_success "Docker is installed"
    if docker ps &> /dev/null; then
        print_success "Docker daemon is running"
    else
        print_error "Docker daemon is not running"
    fi
else
    print_error "Docker is not installed"
fi
echo ""

# Check 3: Backend Dockerfile
echo "3. Checking Backend Dockerfile..."
if [ -f "backend/Dockerfile" ]; then
    print_success "backend/Dockerfile exists"

    # Check for PORT variable usage
    if grep -q 'CMD.*\${PORT}' backend/Dockerfile; then
        print_error "backend/Dockerfile uses \${PORT} syntax (should be \$PORT)"
        echo "  Fix: Change CMD uvicorn...--port \${PORT} to CMD uvicorn...--port \$PORT"
    else
        print_success "PORT variable syntax is correct"
    fi

    # Check for cloudbuild.yaml
    if [ -f "backend/cloudbuild.yaml" ]; then
        print_success "backend/cloudbuild.yaml exists"
    else
        print_warning "backend/cloudbuild.yaml not found (deployment script may fail)"
    fi
else
    print_error "backend/Dockerfile not found"
fi
echo ""

# Check 4: Frontend Dockerfile and configuration
echo "4. Checking Frontend Dockerfile..."
if [ -f "frontend/Dockerfile" ]; then
    print_success "frontend/Dockerfile exists"

    # Check for VITE_BACKEND_URL in production stage
    if grep -A 20 "FROM.*AS production" frontend/Dockerfile | grep -q "ENV VITE_BACKEND_URL"; then
        print_success "VITE_BACKEND_URL is set in production stage"
    else
        print_error "VITE_BACKEND_URL not found in production stage"
        echo "  This will cause frontend to use localhost:8000 as backend URL"
    fi

    # Check cloudbuild.yaml
    if [ -f "frontend/cloudbuild.yaml" ]; then
        print_success "frontend/cloudbuild.yaml exists"

        # Check if VITE_BACKEND_URL is in build args
        if grep -q "VITE_BACKEND_URL" frontend/cloudbuild.yaml; then
            print_success "VITE_BACKEND_URL configured in cloudbuild.yaml"
        else
            print_warning "VITE_BACKEND_URL not found in cloudbuild.yaml"
        fi
    else
        print_error "frontend/cloudbuild.yaml not found"
    fi
else
    print_error "frontend/Dockerfile not found"
fi
echo ""

# Check 5: Environment variables in deploy scripts
echo "5. Checking deployment scripts..."
if [ -f "scripts/deploy-backend.sh" ]; then
    print_success "deploy-backend.sh exists"

    # Check if script tries to set PORT
    if grep -q "set-env-vars.*PORT" scripts/deploy-backend.sh; then
        print_error "deploy-backend.sh tries to set PORT (Cloud Run sets this automatically)"
        echo "  This will cause 'reserved env names' error"
    else
        print_success "Backend deploy script doesn't set PORT"
    fi
else
    print_warning "scripts/deploy-backend.sh not found"
fi

if [ -f "scripts/deploy-frontend.sh" ]; then
    print_success "deploy-frontend.sh exists"

    # Check if script tries to set VITE_BACKEND_URL at runtime
    if grep -q "set-env-vars.*VITE_BACKEND_URL" scripts/deploy-frontend.sh; then
        print_warning "deploy-frontend.sh sets VITE_BACKEND_URL at runtime (should be build-time only)"
        echo "  This may override the build-time value"
    else
        print_success "Frontend deploy script uses build-time VITE_BACKEND_URL"
    fi
else
    print_warning "scripts/deploy-frontend.sh not found"
fi
echo ""

# Check 6: Git status
echo "6. Checking Git status..."
if git rev-parse --git-dir > /dev/null 2>&1; then
    if [ -n "$(git status --porcelain)" ]; then
        print_warning "Uncommitted changes detected"
        echo "  Consider committing changes before deploying"
    else
        print_success "Working directory is clean"
    fi
else
    print_warning "Not a git repository"
fi
echo ""

# Summary
echo "========================================="
echo "Validation Summary"
echo "========================================="
if [ $ERRORS -gt 0 ]; then
    print_error "Found $ERRORS error(s)"
fi
if [ $WARNINGS -gt 0 ]; then
    print_warning "Found $WARNINGS warning(s)"
fi
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    print_success "All checks passed!"
fi
echo ""

if [ $ERRORS -gt 0 ]; then
    echo "⛔ Deployment is likely to fail. Please fix errors before deploying."
    exit 1
else
    echo "✅ Pre-deployment checks passed. Safe to deploy."
    if [ $WARNINGS -gt 0 ]; then
        echo "⚠️  Some warnings were found. Review them before deploying."
    fi
    exit 0
fi

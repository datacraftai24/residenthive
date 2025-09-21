#!/bin/bash

echo "🔧 Creating Admin User via API..."
echo "================================"

# Step 1: Delete existing admin if exists
echo "1️⃣ Cleaning up existing admin..."
docker exec residenthive-db psql -U residenthive -d residenthive_dev -c "DELETE FROM agents WHERE email = 'admin@residenthive.com';" 2>/dev/null

# Step 2: Create agent via invite API
echo "2️⃣ Creating admin agent via invite API..."
INVITE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/agents/invite \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@residenthive.com",
    "firstName": "Admin",
    "lastName": "User",
    "brokerageName": "ResidentHive Admin"
  }')

echo "Invite response: $INVITE_RESPONSE"

# Extract invite token from response
INVITE_TOKEN=$(echo $INVITE_RESPONSE | grep -o '"inviteToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$INVITE_TOKEN" ]; then
  echo "❌ Failed to get invite token"
  exit 1
fi

echo "✅ Got invite token: $INVITE_TOKEN"

# Step 3: Set password using the token
echo "3️⃣ Setting admin password..."
PASSWORD_RESPONSE=$(curl -s -X POST http://localhost:3000/api/agents/setup-password \
  -H "Content-Type: application/json" \
  -d "{
    \"token\": \"$INVITE_TOKEN\",
    \"password\": \"Admin123!\"
  }")

echo "Password setup response: $PASSWORD_RESPONSE"

# Step 4: Test login
echo "4️⃣ Testing login..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/agents/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@residenthive.com",
    "password": "Admin123!"
  }')

if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
  echo ""
  echo "✅ ADMIN USER CREATED SUCCESSFULLY!"
  echo "================================"
  echo "📧 Email: admin@residenthive.com"
  echo "🔐 Password: Admin123!"
  echo "🔗 URL: http://localhost:3000/agent-login"
  echo "================================"
else
  echo "❌ Login test failed"
  echo "Response: $LOGIN_RESPONSE"
fi
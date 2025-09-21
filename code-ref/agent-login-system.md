# Agent Login System - Code Reference

## System Overview

The ResidentHive agent login system is a secure, token-based authentication system that manages agent access through an invite-only model. Agents must be invited by administrators, complete account setup with a secure token, and then can login to access the platform.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
├───────────────────────┬───────────────────┬───────────────────┤
│   /agent-login       │   /agent-setup     │    Protected      │
│   Login Page         │   Setup Page       │    Routes (/)     │
└───────────────────────┴───────────────────┴───────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Layer (Express)                         │
├─────────────────────────────────────────────────────────────────┤
│  POST /api/agents/login                                          │
│  POST /api/agents/setup-password                                 │
│  GET  /api/agents/setup/:token                                   │
│  POST /api/agents/invite (admin)                                 │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Database (PostgreSQL)                         │
├─────────────────────────────────────────────────────────────────┤
│  agents table:                                                   │
│  - id, email, passwordHash, firstName, lastName                  │
│  - brokerageName, inviteToken, isActivated, createdAt           │
└─────────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Database Schema

**Location**: `shared/schema.ts:6-16`

```typescript
export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  brokerageName: text("brokerage_name").notNull(),
  inviteToken: text("invite_token").unique(),
  isActivated: boolean("is_activated").notNull().default(false),
  createdAt: text("created_at").notNull(),
});
```

### 2. Backend Services

#### Agent Invite Service
**Location**: `server/agent-invite-service.ts`

Key functions:
- `readAgentsConfig()` - Reads agents from YAML config
- `generateInviteToken()` - Creates secure 32-byte hex tokens
- `createAgentWithInvite()` - Creates agent record with invite token
- `sendInviteEmail()` - Sends invite email via email service
- `processAgentInvites()` - Batch processes all agents from config
- `inviteAgent()` - Manual invite for individual agents

#### Email Service
**Location**: `server/email-service.ts`

Handles:
- Sending invite emails with setup links
- Sending welcome emails after activation
- Email templates and formatting

### 3. API Endpoints

**Location**: `server/routes.ts`

#### POST `/api/agents/setup-password` (Line 2397)
Sets password and activates agent account.

```typescript
Request: {
  token: string,    // Invite token from email
  password: string  // New password (min 8 chars)
}

Response: {
  success: boolean,
  message: string
}
```

#### POST `/api/agents/login` (Line 2462)
Authenticates agent and returns profile.

```typescript
Request: {
  email: string,
  password: string
}

Response: {
  success: boolean,
  message: string,
  agent: {
    id: number,
    email: string,
    firstName: string,
    lastName: string,
    brokerageName: string,
    isActivated: boolean
  }
}
```

#### GET `/api/agents/setup/:token` (Line 2531)
Validates setup token and returns agent info.

```typescript
Response: {
  success: boolean,
  agent?: AgentInfo,
  error?: string
}
```

### 4. Frontend Components

#### Login Page
**Location**: `client/src/pages/agent-login.tsx`

Features:
- Email/password form
- Error handling
- Saves agent to localStorage on success
- Redirects to dashboard

#### Setup Page
**Location**: `client/src/pages/agent-setup.tsx`

Features:
- Token validation on mount
- Password/confirm password fields
- Password strength requirements (8+ chars)
- Shows agent info during setup
- Redirects to login after completion

#### Protected Route Component
**Location**: `client/src/components/ProtectedRoute.tsx`

Features:
- Wraps protected routes
- Checks localStorage for agent session
- Validates agent data structure
- Redirects to login if not authenticated

#### App Routing
**Location**: `client/src/App.tsx`

Routes:
- `/agent-login` - Public login page
- `/agent-setup` - Public setup page with token
- `/` - Protected dashboard (wrapped in ProtectedRoute)
- `/buyer/:id` - Protected buyer profile page

### 5. Configuration

#### Agent Configuration
**Location**: `config/agents.yaml`

```yaml
agents:
  - firstName: "Admin"
    lastName: "User"
    email: "info@datacraftai.com"
    brokerageName: "DataCraft AI"
  - firstName: "Ranjan"
    lastName: "Dahal"
    email: "ranjan.dahal89@gmail.com"
    brokerageName: "Honest Realty"
```

## Authentication Flow

### 1. Agent Invitation Flow

```
Administrator → Run processAgentInvites()
     ↓
Read agents.yaml
     ↓
For each agent:
  - Check if exists in DB
  - Generate unique token
  - Create DB record
  - Send invite email
     ↓
Agent receives email with setup link:
/agent-setup?token=xxxxx
```

### 2. Account Setup Flow

```
Agent clicks setup link
     ↓
Frontend loads /agent-setup
     ↓
Fetch agent info via token
GET /api/agents/setup/:token
     ↓
Display setup form
     ↓
Agent sets password
     ↓
POST /api/agents/setup-password
     ↓
Backend:
  - Validates token
  - Hashes password (bcrypt)
  - Updates agent record
  - Sets isActivated = true
  - Clears inviteToken
  - Sends welcome email
     ↓
Redirect to /agent-login
```

### 3. Login Flow

```
Agent visits /agent-login
     ↓
Enter email & password
     ↓
POST /api/agents/login
     ↓
Backend:
  - Find agent by email
  - Check isActivated
  - Verify password hash
  - Return agent profile
     ↓
Frontend:
  - Store in localStorage
  - Redirect to dashboard
```

### 4. Session Management

```
User navigates to protected route
     ↓
ProtectedRoute component:
  - Check localStorage for agent
  - Validate agent data
  - If valid: render children
  - If invalid: redirect to login
```

## Current Issues

### Security Issues

1. **No JWT Implementation**
   - Using localStorage directly (vulnerable to XSS)
   - No token expiry
   - No refresh token mechanism

2. **Session Management**
   - No server-side session validation
   - No logout functionality
   - Sessions persist indefinitely

3. **Agent ID Handling**
   - Hardcoded default agent ID (29) in routes.ts:188
   - Agent ID passed via headers (easily spoofed)

### Code Quality Issues

1. **Console Logging**
   - Production console.logs throughout (routes.ts:2463-2505)
   - Sensitive information potentially logged

2. **Error Handling**
   - Inconsistent error responses
   - No proper error boundaries in React

3. **Type Safety**
   - Missing TypeScript interfaces in some places
   - Any types used in error handling

### Missing Features

1. **Password Management**
   - No forgot password flow
   - No password reset capability
   - No password strength validation beyond length

2. **User Experience**
   - No remember me option
   - No session timeout warnings
   - No multi-tab synchronization

## Proposed Improvements

### 1. Implement JWT Authentication

```typescript
// Add JWT service
class JWTService {
  generateTokens(agentId: number) {
    const accessToken = jwt.sign(
      { agentId },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign(
      { agentId },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
    return { accessToken, refreshToken };
  }
}
```

### 2. Add Auth Context

```typescript
// Create React context for auth
const AuthContext = createContext<{
  agent: Agent | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}>({...});
```

### 3. Implement Logout

```typescript
// Add logout endpoint
app.post("/api/agents/logout", (req, res) => {
  // Clear refresh token from DB
  // Return success
});
```

### 4. Add Password Reset

```typescript
// Add password reset flow
app.post("/api/agents/forgot-password", async (req, res) => {
  // Generate reset token
  // Send reset email
});

app.post("/api/agents/reset-password", async (req, res) => {
  // Validate reset token
  // Update password
});
```

### 5. Remove Hardcoded Values

Replace hardcoded agent ID with proper auth middleware:

```typescript
// Auth middleware
const authenticateAgent = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.agentId = decoded.agentId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};
```

## Testing Checklist

- [ ] Agent invitation creates record in DB
- [ ] Invite email is sent successfully
- [ ] Setup link validates token correctly
- [ ] Password requirements are enforced
- [ ] Account activation works
- [ ] Login with correct credentials succeeds
- [ ] Login with wrong credentials fails
- [ ] Protected routes redirect when not authenticated
- [ ] Session persists across page refreshes
- [ ] Multiple agents can be managed separately

## Environment Variables Required

```env
# Email Service
EMAIL_FROM=noreply@residenthive.com
EMAIL_REPLY_TO=support@residenthive.com
RESEND_API_KEY=your_resend_api_key

# Security
JWT_SECRET=your_jwt_secret_key
JWT_REFRESH_SECRET=your_refresh_secret_key

# App
APP_URL=http://localhost:3000
```

## Related Files

- `shared/schema.ts` - Database schema definitions
- `server/agent-invite-service.ts` - Invite logic
- `server/email-service.ts` - Email sending
- `server/email-templates.ts` - Email HTML templates
- `server/routes.ts` - API endpoints
- `client/src/pages/agent-login.tsx` - Login UI
- `client/src/pages/agent-setup.tsx` - Setup UI
- `client/src/components/ProtectedRoute.tsx` - Route protection
- `client/src/App.tsx` - Route definitions
- `config/agents.yaml` - Agent configuration
- `migrations/0000_absent_outlaw_kid.sql` - DB migrations

---

*Last Updated: 2025-09-20*
*Author: ResidentHive Development Team*
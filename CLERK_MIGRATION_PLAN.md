# Clerk Authentication Migration Plan - React (Vite) + Express

## Executive Summary
Migrate ResidentHive from vulnerable localStorage authentication to Clerk's managed authentication service. This will resolve all security issues identified and provide production-ready auth in 1-2 days.

## Current Security Issues to Fix
1. **XSS Vulnerability**: localStorage can be accessed by any JavaScript
2. **No Session Expiry**: Sessions persist indefinitely
3. **No Logout**: Users cannot end sessions
4. **Hardcoded IDs**: Agent ID defaulting to 29/28 causing data leaks
5. **No Rate Limiting**: Login endpoints vulnerable to brute force
6. **No Audit Trail**: No security event logging

## Migration Strategy

### Phase 1: Setup Clerk (Day 1 Morning)
1. **Create Clerk Application**
   - Sign up at clerk.com
   - Create new application for ResidentHive
   - Choose React as framework (not Next.js)
   - Get your Publishable Key and Secret Key from [API keys page](https://dashboard.clerk.com/last-active?path=api-keys)

2. **Install Dependencies**
   ```bash
   # Frontend - React SDK
   npm install @clerk/clerk-react@latest

   # Backend - Node/Express SDK
   npm install @clerk/clerk-sdk-node @clerk/express
   ```

3. **Configure Environment Variables**
   ```bash
   # .env.local (for Vite frontend)
   VITE_CLERK_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY

   # .env (for Express backend)
   CLERK_SECRET_KEY=YOUR_SECRET_KEY
   ```

### Phase 2: Backend Migration (Day 1 Afternoon)

#### 2.1 Remove Old Auth Endpoints
**Files to modify:**
- `server/routes.ts` - Remove lines 2410-2540 (setup-password, login endpoints)
- Remove agent-invite-service.ts (replaced by Clerk invitations)
- Remove email-templates.ts (Clerk handles auth emails)

#### 2.2 Add Clerk Express Middleware
**New file:** `server/middleware/clerk-auth.ts`
```typescript
import { ClerkExpressRequireAuth } from '@clerk/express';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { db } from '../db.js';
import { agents } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

// Middleware to verify JWT and attach userId
export const requireAuth = ClerkExpressRequireAuth();

// Helper to get/create agent from Clerk user
export const getAgentFromClerk = async (req: any) => {
  const { userId } = req.auth;
  if (!userId) return null;

  // Look up agent by Clerk userId
  const [agent] = await db.select().from(agents)
    .where(eq(agents.clerkUserId, userId))
    .limit(1);

  if (!agent) {
    // Get user from Clerk and auto-create agent record
    const user = await clerkClient.users.getUser(userId);
    const [newAgent] = await db.insert(agents).values({
      clerkUserId: userId,
      email: user.emailAddresses[0].emailAddress,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      brokerageName: user.publicMetadata?.brokerageName as string || 'Independent',
      createdAt: new Date().toISOString()
    }).returning();
    return newAgent;
  }

  return agent;
};
```

#### 2.3 Update Database Schema
**Modify:** `shared/schema.ts`
```typescript
export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").unique(), // NEW
  email: text("email").notNull().unique(),
  // Remove: passwordHash, inviteToken, isActivated
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  brokerageName: text("brokerage_name").notNull(),
  createdAt: text("created_at").notNull(),
});
```

#### 2.4 Protect API Routes
**Update all protected routes in:** `server/routes.ts`
```typescript
// Before (line 185-203)
app.get("/api/buyer-profiles", async (req, res) => {
  const agentId = req.headers['x-agent-id'] ? parseInt(req.headers['x-agent-id'] as string) : 29;
  // ...
});

// After
app.get("/api/buyer-profiles", requireAuth, async (req, res) => {
  const agent = await getAgentFromClerk(req);
  if (!agent) return res.status(403).json({ error: "Agent not found" });
  const agentId = agent.id;
  // ...
});
```

### Phase 3: Frontend Migration (Day 2 Morning)

#### 3.1 Setup Clerk Provider
**Update:** `client/src/main.tsx`
```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ClerkProvider } from '@clerk/clerk-react';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Clerk Publishable Key');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl="/"
    >
      <App />
    </ClerkProvider>
  </StrictMode>
);
```

#### 3.2 Replace ProtectedRoute
**Update:** `client/src/components/ProtectedRoute.tsx`
```typescript
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
```

#### 3.3 Remove Custom Login Pages
**Delete these files:**
- `client/src/pages/agent-login.tsx` (replaced by Clerk's SignIn)
- `client/src/pages/agent-setup.tsx` (replaced by Clerk's SignUp)

#### 3.4 Update App Component with Clerk Components
**Update:** `client/src/App.tsx`
```typescript
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SignIn, SignUp, UserButton, SignedIn, SignedOut } from '@clerk/clerk-react';
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import ClientDashboard from "@/pages/client-dashboard";
import Analytics from "@/pages/analytics";
import ProtectedRoute from "@/components/ProtectedRoute";

function Router() {
  return (
    <>
      {/* Add UserButton to header for signed-in users */}
      <SignedIn>
        <div className="absolute top-4 right-4 z-50">
          <UserButton afterSignOutUrl="/" />
        </div>
      </SignedIn>

      <Switch>
        {/* Clerk auth routes */}
        <Route path="/sign-in/*">
          <SignIn routing="path" path="/sign-in" redirectUrl="/" />
        </Route>
        <Route path="/sign-up/*">
          <SignUp routing="path" path="/sign-up" redirectUrl="/" />
        </Route>

        {/* Public routes */}
        <Route path="/client/:shareId" component={ClientDashboard} />

        {/* Protected routes */}
        <Route path="/analytics">
          <ProtectedRoute>
            <Analytics />
          </ProtectedRoute>
        </Route>

        <Route path="/">
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
```

#### 3.5 Update API Calls
**Update all API calls to use Clerk session:**
```typescript
// Example in dashboard.tsx
import { useAuth } from '@clerk/clerk-react';

export default function Dashboard() {
  const { getToken } = useAuth();

  const fetchBuyerProfiles = async () => {
    const token = await getToken();
    const response = await fetch('/api/buyer-profiles', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    // ...
  };
}
```

**Create a custom fetch wrapper:** `client/src/lib/api.ts`
```typescript
import { useAuth } from '@clerk/clerk-react';

export const useAuthFetch = () => {
  const { getToken } = useAuth();

  return async (url: string, options: RequestInit = {}) => {
    const token = await getToken();
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  };
};
```

### Phase 4: Agent Management (Day 2 Afternoon)

#### 4.1 Clerk User Management Strategy
Instead of complex invite system, use Clerk's built-in user management:
1. Create agents directly in Clerk Dashboard
2. Set public metadata for brokerage info
3. Auto-sync with database on first login

#### 4.2 Webhook Setup for User Sync
**Configure webhook in Clerk Dashboard:**
1. Go to Webhooks in Clerk Dashboard
2. Add endpoint: `https://yourdomain.com/api/webhooks/clerk`
3. Subscribe to events: `user.created`, `user.updated`

**New webhook handler:** `server/webhooks/clerk.ts`
```typescript
import { Webhook } from 'svix';
import { WebhookEvent } from '@clerk/clerk-sdk-node';

app.post('/api/webhooks/clerk', async (req, res) => {
  // Verify webhook signature
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    throw new Error('Missing CLERK_WEBHOOK_SECRET');
  }

  const svix_id = req.headers['svix-id'] as string;
  const svix_timestamp = req.headers['svix-timestamp'] as string;
  const svix_signature = req.headers['svix-signature'] as string;

  const body = JSON.stringify(req.body);
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  // Handle the webhook
  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    const { id, email_addresses, first_name, last_name, public_metadata } = evt.data;

    // Upsert agent record
    await db.insert(agents)
      .values({
        clerkUserId: id,
        email: email_addresses[0].email_address,
        firstName: first_name || '',
        lastName: last_name || '',
        brokerageName: public_metadata?.brokerageName as string || 'Independent',
        createdAt: new Date().toISOString()
      })
      .onConflictDoUpdate({
        target: agents.clerkUserId,
        set: {
          email: email_addresses[0].email_address,
          firstName: first_name || '',
          lastName: last_name || '',
          brokerageName: public_metadata?.brokerageName as string || 'Independent'
        }
      });
  }

  return res.json({ received: true });
});
```

### Phase 5: Testing & Deployment

#### 5.1 Testing Checklist
- [ ] Agent can sign up via invitation
- [ ] Agent can sign in with Clerk
- [ ] Protected routes require authentication
- [ ] API calls include proper auth headers
- [ ] Agent data properly isolated
- [ ] No hardcoded IDs remaining
- [ ] Sessions expire properly
- [ ] Logout functionality works

#### 5.2 Migration Script
**Create:** `migrations/clerk-migration.sql`
```sql
-- Add Clerk columns
ALTER TABLE agents ADD COLUMN clerk_user_id TEXT UNIQUE;

-- Remove old auth columns (after verification)
-- ALTER TABLE agents DROP COLUMN password_hash;
-- ALTER TABLE agents DROP COLUMN invite_token;
-- ALTER TABLE agents DROP COLUMN is_activated;
```

## Files to Modify/Delete

### Backend Files
**Modify:**
- `server/routes.ts` - Add Clerk middleware, remove old auth endpoints (lines 2410-2540)
- `shared/schema.ts` - Add `clerkUserId` column to agents table
- `package.json` - Add Clerk dependencies

**Delete:**
- `server/agent-invite-service.ts` - Replaced by Clerk user management
- `server/email-service.ts` - No longer needed for auth emails
- `server/email-templates.ts` - No longer needed

**Create:**
- `server/middleware/clerk-auth.ts` - Clerk Express authentication middleware
- `server/webhooks/clerk.ts` - Handle Clerk webhook events

### Frontend Files
**Modify:**
- `client/src/main.tsx` - Wrap with ClerkProvider
- `client/src/App.tsx` - Add Clerk auth routes and UserButton
- `client/src/components/ProtectedRoute.tsx` - Use Clerk's SignedIn/SignedOut
- `client/src/pages/dashboard.tsx` - Update API calls to use Clerk tokens
- `client/package.json` - Add @clerk/clerk-react
- `.env.local` - Add VITE_CLERK_PUBLISHABLE_KEY

**Delete:**
- `client/src/pages/agent-login.tsx` - Replaced by Clerk's SignIn
- `client/src/pages/agent-setup.tsx` - Replaced by Clerk's SignUp

**Create:**
- `client/src/lib/api.ts` - Auth-aware fetch wrapper

## Benefits After Migration

1. **Security**
   - httpOnly cookies for sessions
   - Automatic CSRF protection
   - Rate limiting built-in
   - Session expiry and refresh
   - Secure password reset flow

2. **Features**
   - Social login (Google, etc.)
   - Multi-factor authentication
   - Session management dashboard
   - User impersonation for support
   - Audit logs

3. **Developer Experience**
   - No password management code
   - Built-in React hooks
   - TypeScript support
   - Webhook events
   - User metadata storage

## Timeline

**Day 1:**
- Morning: Clerk setup and configuration (2 hours)
- Afternoon: Backend migration (4 hours)

**Day 2:**
- Morning: Frontend migration (3 hours)
- Afternoon: Testing and refinement (3 hours)

**Total: 10-12 hours of development**

## Implementation Order

1. **Start with Clerk Setup** (30 min)
   - Create Clerk application
   - Get API keys
   - Configure environment variables

2. **Frontend First Approach** (4 hours)
   - Install @clerk/clerk-react
   - Update main.tsx with ClerkProvider
   - Replace ProtectedRoute component
   - Add SignIn/SignUp routes
   - Test authentication flow

3. **Backend Integration** (4 hours)
   - Install @clerk/express and @clerk/clerk-sdk-node
   - Create clerk-auth middleware
   - Update database schema
   - Protect API endpoints
   - Setup webhooks

4. **Testing & Cleanup** (2 hours)
   - Test all auth flows
   - Remove old auth code
   - Update documentation

## Rollback Plan

If issues arise:
1. Keep old auth endpoints but mark deprecated
2. Use feature flag to toggle between auth systems
3. Gradual migration of users
4. Full rollback by reverting branch

## Quick Start Checklist

### Day 1 - Frontend Setup (Can deploy immediately)
- [ ] Sign up at clerk.com and create React application
- [ ] Install `@clerk/clerk-react@latest`
- [ ] Add `VITE_CLERK_PUBLISHABLE_KEY` to `.env.local`
- [ ] Update `client/src/main.tsx` with ClerkProvider
- [ ] Update `client/src/App.tsx` with auth routes
- [ ] Replace `ProtectedRoute.tsx` with Clerk components
- [ ] Test sign up, sign in, and sign out flows

### Day 2 - Backend Integration
- [ ] Install `@clerk/express` and `@clerk/clerk-sdk-node`
- [ ] Add `CLERK_SECRET_KEY` to `.env`
- [ ] Create `server/middleware/clerk-auth.ts`
- [ ] Update `server/routes.ts` to use requireAuth
- [ ] Add `clerkUserId` to database schema
- [ ] Setup webhook for user sync
- [ ] Remove old auth code

## Resources

- [Clerk React Quickstart](https://clerk.com/docs/quickstarts/react)
- [Clerk Express Guide](https://clerk.com/docs/backend/express/overview)
- [Your Clerk Dashboard](https://dashboard.clerk.com)
- [API Keys](https://dashboard.clerk.com/last-active?path=api-keys)

---

*This plan ensures zero downtime and can be implemented incrementally with safe rollback points at each phase.*
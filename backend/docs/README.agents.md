Agents Router (Auth/Setup)

Overview
Handles agent authentication and initial setup. The system uses a multi-tenant architecture where:
- **Agents** are the primary tenants (real estate agents/brokers)
- **Buyer Profiles** belong to agents (one-to-many relationship)
- Clerk JWT authentication enforces agent isolation across all endpoints

## Multi-Tenant Architecture

### Authentication Flow
1. **Agent Login via Clerk**: Frontend uses Clerk for authentication
2. **JWT Token**: Clerk issues JWT with agent_id in publicMetadata
3. **Backend Verification**: FastAPI dependency `get_current_agent_id()` validates JWT and extracts agent_id
4. **Authorization**: All endpoints filter/verify data belongs to authenticated agent

### Data Isolation Model
```
Agent (agent_id=1)
  └── Buyer Profile (id=101, agent_id=1)
       ├── Search Transactions (profile_id=101)
       ├── Cached Results (profile_id=101)
       └── Feedback (profile_id=101)

Agent (agent_id=2)
  └── Buyer Profile (id=102, agent_id=2)
       └── ...
```

**Key Security Rules**:
- Agents can only access their own buyer profiles
- Database queries include `WHERE agent_id = %s` filter
- Profile creation automatically sets agent_id from JWT
- Update/delete operations verify ownership before execution

### Clerk Integration
- **publicMetadata.agentId**: Stores agent database ID
- **JWT Claims**: Verified on every API request
- **Dependency Injection**: `get_current_agent_id()` used across all protected routes

### Future: Buyer Portal
Two architectural options for buyer access:
1. **Magic Links**: Email-based temporary access (no auth system)
2. **Dual Auth**: Add Clerk user accounts for buyers with role-based access

Current implementation: Agent-only authentication

Endpoints
1) GET /api/agents/setup/{token}
   - Fetch agent record by invite token to drive setup UI.
   - Path params: token (string)
   - Response 200
     { "success": true, "agent": { "id": 28, "email": "a@b.com", "firstName": "A", "lastName": "B", "brokerageName": "X", "isActivated": false } }
   - Response 200 (not found)
     { "success": false, "error": "Invalid or expired setup link" }

2) POST /api/agents/setup-password
   - Sets/updates the agent password and activates the account.
   - Body
     { "token": "<invite_token>", "password": "<min 8 chars>" }
   - Response 200
     { "success": true }
   - Response 400
     { "detail": "Password must be at least 8 characters" }
   - Response 200 (invalid token)
     { "success": false, "error": "Invalid or expired setup token" }

3) POST /api/agents/login
   - Validates email/password against bcrypt `password_hash`.
   - Body
     { "email": "user@example.com", "password": "secret" }
   - Response 200 (success)
     { "success": true, "agent": { "id": 28, "email": "user@example.com", "firstName": "...", "lastName": "...", "brokerageName": "...", "isActivated": true } }
   - Response 200 (failure)
     { "success": false, "message": "Invalid credentials" }
     or { "success": false, "message": "Account not set up" }

Tables used
- agents: columns include id, email, password_hash, first_name, last_name, brokerage_name, invite_token, is_activated, created_at

Notes
- Passwords are stored using bcrypt. Existing DB entries should already be bcrypt for compatibility.
- No session issuance here; frontend stores the returned agent object client-side for demo.


Agents Router (Auth/Setup)

Overview
Handles simple agent login and initial password setup using bcrypt hashes stored in the `agents` table.

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


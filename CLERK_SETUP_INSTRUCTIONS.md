# Clerk Authentication Setup Instructions

## 🚀 Quick Start for Developers

### Branch Information
- **Branch Name**: `feat/clerk-auth-integration`
- **GitHub URL**: https://github.com/datacraftai24/residenthive/pull/new/feat/clerk-auth-integration
- **Status**: Ready for testing

---

## 📝 Setup Steps

### 1. Get the Latest Code
```bash
git fetch origin
git checkout feat/clerk-auth-integration
npm install
```

### 2. Set Up Environment Variables

You need to create two environment files with your Clerk keys:

#### Create `.env.local` (for backend)
Copy from `.env.example` and add your keys:
```bash
cp .env.example .env.local
```

Then edit `.env.local` and set:
- `VITE_CLERK_PUBLISHABLE_KEY` - Get from Clerk Dashboard
- `CLERK_SECRET_KEY` - Get from Clerk Dashboard

#### Create `client/.env` (for frontend)
```bash
cp client/.env.example client/.env
```

Then edit `client/.env` and set:
- `VITE_CLERK_PUBLISHABLE_KEY` - Same as above

### 3. Get Clerk API Keys

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Navigate to **API Keys**
3. Copy:
   - **Publishable Key** (starts with `pk_test_`)
   - **Secret Key** (starts with `sk_test_`)

### 4. Run Database Migration
```bash
npm run db:push
```

### 5. Start the Application

Open two terminals:

**Terminal 1 - Frontend:**
```bash
npx vite
```
Frontend runs at: http://localhost:5173

**Terminal 2 - Backend:**
```bash
npx tsx -r dotenv/config server/index.ts dotenv_config_path=.env.local
```
Backend runs at: http://localhost:3000

---

## ✅ Testing Checklist

### Authentication Flow
- [ ] Visit http://localhost:5173 - Should redirect to /sign-in
- [ ] Create new account via sign-up
- [ ] Sign in with created account
- [ ] Dashboard loads with user data
- [ ] Logout works properly

### API Authentication
- [ ] Open DevTools Network tab
- [ ] Check API calls have `Authorization: Bearer <token>` header
- [ ] API returns data (not 401 errors)

### Clerk Dashboard Setup
- [ ] Sign-up mode set to "Restricted" (invite-only)
- [ ] Social logins disabled (email only)
- [ ] Email verification enabled

---

## 🔧 Troubleshooting

### "Missing Clerk Publishable Key" Error
```bash
# Make sure client/.env exists with:
VITE_CLERK_PUBLISHABLE_KEY=your_key_here

# Restart Vite after adding env vars
```

### API Returns 401 Unauthorized
```bash
# Check .env.local has:
CLERK_SECRET_KEY=your_secret_key_here

# Restart backend server
```

### Database Error
```bash
# Run migration:
npm run db:push

# Check DATABASE_URL in .env.local
```

---

## 📋 What Was Changed

### Security Fixes
- ✅ Removed vulnerable localStorage authentication
- ✅ Eliminated hardcoded agent IDs (28/29)
- ✅ Added proper session management
- ✅ Implemented secure JWT tokens
- ✅ Added automatic session expiry

### New Features
- Invite-only system via Clerk
- Proper logout functionality
- Rate limiting built-in
- Audit trail capability
- Multi-factor auth ready (can enable in Clerk)

### Files Modified
- Frontend auth components
- Backend middleware
- Database schema (added clerkUserId)
- API endpoints protection
- Environment configuration

---

## 🚀 Deployment Notes

Before deploying to production:

1. **Create Production Clerk App**
   - Use production keys (`pk_live_`, `sk_live_`)
   - Configure production domain

2. **Update Environment Variables**
   - Set production keys in hosting platform
   - Ensure NODE_ENV=production

3. **Run Database Migration**
   - Apply migration to production DB
   - Verify clerkUserId column exists

4. **Clean Up Old Code**
   After verification, delete:
   - `client/src/pages/agent-login.tsx`
   - `client/src/pages/agent-setup.tsx`
   - Old auth endpoints in routes.ts

---

## 📞 Support

If you encounter issues:
1. Check this guide first
2. Review `CLERK_MIGRATION_PLAN.md` for detailed info
3. Check Clerk Dashboard for user/config issues
4. Contact team lead for Clerk access/keys

---

## 🔗 Resources

- [Clerk Documentation](https://clerk.com/docs)
- [Clerk Dashboard](https://dashboard.clerk.com)
- [GitHub Branch](https://github.com/datacraftai24/residenthive/tree/feat/clerk-auth-integration)

---

*Implementation Date: 2025-09-20*
*Security Issue Addressed: XSS vulnerability in localStorage authentication*
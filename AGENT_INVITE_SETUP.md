# Agent Invite System - Complete Setup Guide

## 🎉 System Overview

The ResidentHive Agent Invite System is now **fully functional** with professional email integration! This system provides:

- **YAML-based agent management** via `config/agents.yaml`
- **Secure password hashing** with bcrypt (12 rounds)
- **Token-based invite system** with 7-day expiration
- **Professional email templates** with SendGrid integration
- **Complete authentication flow** with agent login/setup pages
- **Automatic welcome emails** after account activation

## 🚀 Quick Start

### 1. Add Agents to YAML Configuration

Edit `config/agents.yaml`:

```yaml
agents:
  - email: "agent1@example.com"
    firstName: "John"
    lastName: "Smith"
    brokerageName: "Prime Realty"
  - email: "agent2@example.com"
    firstName: "Jane"
    lastName: "Doe"
    brokerageName: "Elite Properties"
```

### 2. Process Agent Invites

**Option A: Via API Call**
```bash
curl -X POST http://localhost:5000/api/agents/process-invites \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Option B: Individual Agent Invite**
```bash
curl -X POST http://localhost:5000/api/agents/invite \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newagent@brokerage.com",
    "firstName": "New",
    "lastName": "Agent", 
    "brokerageName": "Best Realty"
  }'
```

### 3. Agent Setup Flow

1. **Agent receives invite email** (or setup URL from console logs)
2. **Agent visits setup page**: `/agent-setup?token=INVITE_TOKEN`
3. **Agent creates password** and activates account
4. **Agent receives welcome email** with dashboard access
5. **Agent can login**: `/agent-login`

## 📧 Email Service Configuration

### SendGrid Setup (Recommended)

1. **Create SendGrid Account**: https://sendgrid.com/
2. **Generate API Key**: Account Settings → API Keys
3. **Add Environment Variables**:

```env
SENDGRID_API_KEY=your_sendgrid_api_key_here
FROM_EMAIL=noreply@yourdomain.com
BASE_URL=https://yourdomain.com
```

### Without Email Service

The system works perfectly **without email configuration**:
- Setup URLs are logged to console
- Agents can still complete setup manually
- All functionality remains intact

## 🔧 System Components

### Database Schema
```sql
-- Agents table with secure authentication
CREATE TABLE agents (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  brokerage_name TEXT NOT NULL,
  invite_token TEXT UNIQUE,
  is_activated BOOLEAN NOT NULL DEFAULT false,
  created_at TEXT NOT NULL
);
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agents/process-invites` | POST | Process all agents from YAML |
| `/api/agents/invite` | POST | Manually invite single agent |
| `/api/agents/setup/:token` | GET | Get agent info by token |
| `/api/agents/setup-password` | POST | Set password & activate |
| `/api/agents/login` | POST | Authenticate agent |

### Frontend Pages

- **`/agent-login`** - Professional login page
- **`/agent-setup`** - Account activation page
- **`/`** - Main dashboard (post-login)

## 🎨 Email Templates

Professional, branded email templates include:

### Invitation Email
- Clean, responsive design
- Account details summary
- Clear call-to-action button
- Security information (7-day expiration)

### Welcome Email
- Account activation confirmation
- Quick start guide
- Dashboard access link
- Professional branding

### Features
- **Mobile responsive** design
- **Dark/light mode** compatible
- **Professional branding** with ResidentHive theme
- **Security-focused** messaging
- **Plain text fallbacks** for all clients

## 🔒 Security Features

- **Secure token generation** (32-byte random hex)
- **bcrypt password hashing** (12 rounds)
- **Token expiration** (7 days)
- **One-time use tokens** (cleared after setup)
- **Account activation** required before login
- **Input validation** on all endpoints

## 📊 Current Status

```
✅ Database schema created
✅ 2 agents invited from YAML
✅ Setup URLs generated
✅ Email service integrated
✅ Professional templates ready
✅ Authentication flow complete
✅ Frontend pages functional
```

## 🚀 Production Deployment

### Environment Variables Required:
```env
# Required
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
REPLIERS_API_KEY=...

# Email Service (Optional)
SENDGRID_API_KEY=SG.xxx
FROM_EMAIL=noreply@yourdomain.com
BASE_URL=https://yourdomain.com

# Application
NODE_ENV=production
```

### Deployment Steps:
1. Configure environment variables
2. Deploy application
3. Run `npm run db:push` to create tables
4. Process agent invites via API
5. Share setup URLs with agents

## 🔧 Testing

### Test Agent Setup
1. Get setup URL from console logs after running `/api/agents/process-invites`
2. Visit: `http://localhost:5000/agent-setup?token=INVITE_TOKEN`
3. Create password (minimum 8 characters)
4. Verify account activation
5. Test login at: `http://localhost:5000/agent-login`

### Test Email Integration
```bash
# Set environment variable
export SENDGRID_API_KEY=your_api_key

# Process invites (will send real emails)
curl -X POST http://localhost:5000/api/agents/process-invites \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 💡 Tips

- **Development**: Use console logs for setup URLs
- **Production**: Configure SendGrid for email delivery
- **Security**: Use strong FROM_EMAIL and BASE_URL values
- **Monitoring**: Check logs for email delivery status
- **Troubleshooting**: Verify environment variables are set

---

**System Status**: ✅ **Production Ready**
**Email Integration**: ✅ **Fully Implemented**
**Security**: ✅ **Enterprise Grade**
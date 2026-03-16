# ResidentHive WhatsApp Integration

## Executive Summary

Enable real estate agents to manage their entire buyer pipeline via WhatsApp - creating profiles, searching properties, generating reports, and sending outreach - all without leaving the chat.

---

## Part 1: The Problem

### Current State
Agents use a web dashboard to manage buyers. This requires:
- Opening laptop/browser
- Logging in
- Navigating UI
- Context switching between buyers

### Desired State
Agents manage everything from WhatsApp - the app they already have open all day.

### Core Challenge
**One agent, 15+ buyers, one chat thread.**

How do you avoid:
- Name collisions (two "Sarah"s)
- Context confusion (which buyer am I working with?)
- Command memorization (what do I type?)
- Typing fatigue (too much text input)

---

## Part 2: The Solution

### Design Principles

1. **Tap > Type** - Use WhatsApp interactive elements (lists, buttons) wherever possible
2. **Show, Don't Tell** - Visual buyer cards eliminate ambiguity
3. **Progressive Disclosure** - Simple for beginners, shortcuts for power users
4. **Persistent Context** - Stay with one buyer until explicitly done
5. **Graceful Disambiguation** - When unsure, ask with options (don't guess)

---

## Part 3: Buyer Identification System

### The Problem with Names

```
Agent: "Search for Sarah"
Bot:   ??? (Which Sarah?)
       - Sarah Chen (Cambridge, $600K)
       - Sarah Miller (Boston, $900K)
       - Sarah Patel (Somerville, $450K)
```

### Solution: Buyer Codes

Each buyer gets a **unique short code** within an agent's account:

| Buyer | Code | Display Name |
|-------|------|--------------|
| Sarah Chen | `SC1` | Sarah C. (SC1) |
| Sarah Miller | `SM1` | Sarah M. (SM1) |
| Mike Johnson | `MJ1` | Mike J. (MJ1) |
| Sarah Patel | `SP1` | Sarah P. (SP1) |

**Code format**: First initial + Last initial + number (if collision)

### How It Works

```
Agent: "Search for Sarah"

Bot:   "I found 3 buyers named Sarah:
        
        ┌─ SC1 ─────────────────┐
        │ Sarah Chen            │
        │ Cambridge · $600-750K │
        │ 3bd · Last: 2 days ago│
        └───────────────────────┘
        
        ┌─ SM1 ─────────────────┐
        │ Sarah Miller          │
        │ Boston · $800-950K    │
        │ 4bd · Last: 1 week ago│
        └───────────────────────┘
        
        ┌─ SP1 ─────────────────┐
        │ Sarah Patel           │
        │ Somerville · $400-500K│
        │ 2bd · New buyer       │
        └───────────────────────┘
        
        Tap one, or reply with code (SC1, SM1, SP1)"
```

### Unambiguous References

These always work without disambiguation:
- **Full name**: "Sarah Chen" (exact match)
- **Code**: "SC1" 
- **Tap selection**: Interactive list/button

---

## Part 4: User Journeys

### Journey 1: First-Time User (Onboarding)

```
[Agent connects WhatsApp for first time]

Bot:   "👋 Welcome to ResidentHive on WhatsApp!
        
        I'm your assistant for managing buyers. Here's what I can do:
        
        📋 View & manage your buyer list
        🔍 Search properties for any buyer
        📄 Generate & send buyer reports
        ✏️ Update buyer preferences
        
        You have 8 buyers in your account.
        
        [View My Buyers] [Create New Buyer] [Quick Tour]"

[Agent taps "View My Buyers"]

Bot:   "📋 Your Buyers (8 total)
        
        🔴 NEEDS ATTENTION
        ┌─ SC1 ─────────────────┐
        │ Sarah Chen            │
        │ Viewed report · 3 notes│
        └───────────────────────┘
        
        🟡 READY FOR ACTION  
        ┌─ MJ1 ─────────────────┐
        │ Mike Johnson          │
        │ Search ready · 47 homes│
        └───────────────────────┘
        
        🟢 MONITORING
        ┌─ PS1 ─────────────────┐
        │ Priya Sharma          │
        │ Price drop on saved   │
        └───────────────────────┘
        
        [Show All 8] [Search for a Buyer]
        
        💡 Tip: Tap any buyer card to start working with them"
```

---

### Journey 2: Daily User (Typical Flow)

```
[Agent opens WhatsApp in the morning]

Bot:   "☀️ Good morning, James!
        
        📊 TODAY'S SUMMARY
        ━━━━━━━━━━━━━━━━━━
        🔴 2 need your attention
        🟡 1 report ready to send
        🟢 3 price drops overnight
        
        [Start with Priority Items] [View All Buyers]"

[Agent taps "Start with Priority Items"]

Bot:   "🔴 PRIORITY #1
        
        ┌─ SC1 ─────────────────┐
        │ Sarah Chen            │
        │ Cambridge · $600-750K │
        │ 3bd/2ba · Garage req. │
        ├───────────────────────┤
        │ 📝 Left 3 notes on    │
        │    report yesterday   │
        │                       │
        │ \"Love 123 Oak St!    │
        │  Can we see it Sat?\" │
        └───────────────────────┘
        
        [View Her Notes] [Schedule Showing] [Reply to Sarah] [Next Priority]"

[Agent taps "View Her Notes"]

Bot:   "📝 Sarah's Notes on Report
        
        🏠 123 Oak St ($680K)
        \"Love this one! The kitchen is exactly 
        what I wanted. Can we see it Saturday?\"
        
        🏠 456 Maple Ave ($710K)  
        \"Too far from the T station\"
        
        🏠 789 Pine Rd ($695K)
        \"Needs too much work\"
        
        [Reply to Sarah] [Update Her Search] [Mark as Done] [Next Priority]"

[Agent taps "Next Priority"]

Bot:   "🔴 PRIORITY #2
        
        ┌─ MJ1 ─────────────────┐
        │ Mike Johnson          │
        │ Boston · $800-950K    │
        │ 4bd/3ba · Modern pref │
        ├───────────────────────┤
        │ 🔍 Search completed   │
        │    47 properties found│
        │    Top 5 ready        │
        └───────────────────────┘
        
        [View Top 5] [Generate Report] [Adjust Search] [Skip for Now]"
```

---

### Journey 3: Power User (Speed Mode)

Power users can skip the visual cards and use shortcuts:

```
Agent: "mj1 report send"

Bot:   "⚡ Quick Action: Mike Johnson
        
        ✅ Generated report (5 properties)
        ✅ Sent to mike.johnson@email.com
        
        [View Report] [Undo Send]"
```

**Shortcut Syntax**:
| Command | Action |
|---------|--------|
| `mj1` | Open Mike Johnson's context |
| `mj1 s` or `mj1 search` | Search for Mike |
| `mj1 r` or `mj1 report` | Generate report |
| `mj1 r send` | Generate and send report |
| `mj1 edit` | Edit profile |
| `all` | View all buyers |
| `new` | Create new buyer |

---

### Journey 4: Creating a New Buyer

```
[Agent taps "Create New Buyer" or types "new"]

Bot:   "📝 New Buyer
        
        Tell me about your buyer. Include whatever you know:
        • Name & contact info
        • Location preferences  
        • Budget range
        • Bedrooms/bathrooms
        • Must-haves or dealbreakers
        
        Or just paste their inquiry email/text.
        
        [Use Form Instead] [Cancel]"

Agent: "New client Alex Rivera, alex@email.com, 617-555-1234
        Looking in Brookline or Newton, budget around 900K
        Needs 4 bedrooms minimum, wants good schools
        Dealbreaker: no busy roads"

Bot:   "✅ Got it! Here's what I extracted:
        
        ┌─ AR1 ─────────────────┐
        │ Alex Rivera           │
        │ alex@email.com        │
        │ 617-555-1234          │
        ├───────────────────────┤
        │ 📍 Brookline, Newton  │
        │ 💰 ~$900K             │
        │ 🛏️ 4+ bedrooms        │
        │ ✓  Good schools       │
        │ ✗  No busy roads      │
        └───────────────────────┘
        
        [Save & Search Now] [Edit First] [Cancel]"

[Agent taps "Save & Search Now"]

Bot:   "✅ Saved Alex Rivera (AR1)
        
        🔍 Searching Brookline & Newton...
        
        ⏳ Finding properties...
        ⏳ Analyzing top matches...
        
        I'll message you when ready (~30 sec)"

[30 seconds later]

Bot:   "🔍 Search Complete for Alex Rivera (AR1)
        
        Found 31 properties → Top 5 selected
        
        🥇 42 Oak Hill Rd, Brookline
           $895K · 4bd/3ba · 2,400 sqft
           ⭐ 94% match
           ✓ Top school district
           ✓ Quiet cul-de-sac
        
        🥈 18 Walnut St, Newton  
           $925K · 4bd/2.5ba · 2,200 sqft
           ⭐ 89% match
           ✓ Walk to schools
           ⚠️ Near main road (1 block)
        
        [See All 5] [Generate Report] [Adjust Criteria]"
```

---

### Journey 5: Editing a Buyer Profile

```
[Agent is in Sarah Chen's context]

Agent: "She wants to increase budget and add a pool"

Bot:   "📝 Updating Sarah Chen (SC1)
        
        I'll make these changes:
        
        💰 Budget: $600-750K → $650-800K (+$50K)
        🏊 Must-haves: +Pool
        
        [Confirm Changes] [Adjust] [Cancel]"

[Agent taps "Confirm Changes"]

Bot:   "✅ Updated Sarah Chen
        
        💰 Budget: $650K - $800K
        🏊 Must-haves: Garage, Pool
        
        This will likely change her search results.
        
        [Search Again] [Done with Sarah]"
```

---

### Journey 6: Handling Errors & Edge Cases

**Ambiguous Name:**
```
Agent: "Search for Sarah"

Bot:   "I found 3 Sarahs. Which one?
        
        [SC1 - Sarah Chen] [SM1 - Sarah Miller] [SP1 - Sarah Patel]"
```

**No Match:**
```
Agent: "Search for John"

Bot:   "I don't have a buyer named John.
        
        Did you mean one of these?
        • Mike Johnson (MJ1)
        • James Wong (JW1)
        
        [View All Buyers] [Create John as New Buyer]"
```

**Typo:**
```
Agent: "Serch for SC1"

Bot:   "🔍 Searching for Sarah Chen (SC1)..."
        
        (Bot auto-corrects "serch" → "search")
```

**Context Timeout:**
```
[Agent hasn't messaged in 15 minutes]

Agent: "send the report"

Bot:   "It's been a while! Who should I send a report to?
        
        Your recent buyers:
        [SC1 - Sarah Chen] [MJ1 - Mike Johnson] [AR1 - Alex Rivera]"
```

---

## Part 5: Conversation States

```
┌─────────────────────────────────────────────────────────────┐
│                        IDLE STATE                           │
│   No active context. Waiting for input.                     │
│   • Show daily briefing on first message                    │
│   • Respond to any command or buyer selection               │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │ BUYER LIST  │    │   SELECT    │    │   CREATE    │
   │   STATE     │    │   BUYER     │    │   BUYER     │
   │             │    │             │    │             │
   │ Showing all │    │ Disambig-   │    │ Collecting  │
   │ or filtered │    │ uation      │    │ info for    │
   │ buyers      │    │ needed      │    │ new buyer   │
   └─────────────┘    └─────────────┘    └─────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     BUYER CONTEXT STATE                     │
│   Working with a specific buyer. All actions apply to them. │
│                                                             │
│   Active buyer: Sarah Chen (SC1)                            │
│   Context expires: 15 min inactivity or explicit exit       │
│                                                             │
│   Sub-states:                                               │
│   • VIEWING - showing buyer details                         │
│   • SEARCHING - search in progress                          │
│   • RESULTS - showing search results                        │
│   • EDITING - modifying profile                             │
│   • REPORTING - generating/sending report                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                     "done" / "next" / 
                     "all" / timeout
                              │
                              ▼
                    [Back to IDLE STATE]
```

---

## Part 6: Message Templates

### Buyer Card (Reusable Component)

```
┌─ {CODE} ─────────────────┐
│ {Full Name}              │
│ {City} · ${Budget Range} │
│ {Beds}bd/{Baths}ba       │
├──────────────────────────┤
│ {Status Line}            │
│ {Detail if any}          │
└──────────────────────────┘
```

### Property Card (Reusable Component)

```
🏠 {Address}, {City}
   ${Price} · {Beds}bd/{Baths}ba · {Sqft} sqft
   ⭐ {Match %}% match
   ✓ {Positive 1}
   ✓ {Positive 2}
   ⚠️ {Concern if any}
```

### Status Indicators

| Icon | Meaning |
|------|---------|
| 🔴 | Needs attention (buyer responded, notes added) |
| 🟡 | Ready for action (search done, report ready) |
| 🟢 | Monitoring (auto-alerts, price drops) |
| ⏳ | In progress (search running) |
| ✅ | Completed (report sent) |

---

## Part 7: Input Patterns (All User Types)

### Natural Language (Everyone)

| What Agent Says | What Happens |
|-----------------|--------------|
| "Show my buyers" | Display buyer list |
| "Search for Sarah Chen" | Start search (exact match) |
| "Search for Sarah" | Disambiguate if multiple |
| "She wants a bigger budget" | Edit active buyer's budget |
| "Send him the report" | Send report to active buyer |
| "Add a new buyer named..." | Start new buyer flow |
| "I'm done with her" | Exit buyer context |
| "What's next?" | Show priority items |

### Taps (Everyone)

All actions available as buttons. Zero typing required for full workflow.

### Codes (Power Users)

| Code | Action |
|------|--------|
| `sc1` | Open Sarah Chen's context |
| `sc1 s` | Search for Sarah Chen |
| `sc1 r` | Generate Sarah's report |
| `sc1 r send` | Generate and send report |
| `all` | View all buyers |
| `new` | Create new buyer |
| `next` | Next priority item |
| `done` | Exit current context |

### Voice Notes (Hands-Free)

Agent sends voice note → Bot transcribes → Processes as text

```
Agent: 🎤 "Run a search for Mike Johnson and 
           if it looks good send him the report"

Bot:   "🎤 Got it!
        
        🔍 Searching for Mike Johnson (MJ1)...
        ✅ 52 properties found
        ✅ Report generated (5 properties)
        📧 Sent to mike.johnson@email.com
        
        [View Report] [Undo Send]"
```

---

## Part 8: WhatsApp Interactive Elements

### List Messages (For Selection)

Used when showing multiple options:

```
┌─────────────────────────────────┐
│ 📋 Select a Buyer               │
│ ─────────────────────────────── │
│ ○ Sarah Chen (SC1)              │
│   Cambridge · $600K · 3bd       │
│ ─────────────────────────────── │
│ ○ Mike Johnson (MJ1)            │
│   Boston · $800K · 4bd          │
│ ─────────────────────────────── │
│ ○ Alex Rivera (AR1)             │
│   Brookline · $900K · 4bd       │
└─────────────────────────────────┘
```

### Quick Reply Buttons (For Actions)

Used after every response:

```
[Search] [Report] [Edit] [Done]
```

Max 3 buttons per row, max 10 buttons total.

### Reply Buttons (For Confirmations)

```
Send report to Sarah Chen?

[Yes, Send Now] [Preview First] [Cancel]
```

---

## Part 9: Session Management

### Session Data Structure

```json
{
  "agent_id": 123,
  "agent_phone": "+16175551234",
  "state": "buyer_context",
  "active_buyer": {
    "id": 456,
    "code": "SC1",
    "name": "Sarah Chen"
  },
  "sub_state": "results",
  "last_search_id": "abc123",
  "context_started_at": "2026-01-20T10:30:00Z",
  "last_activity_at": "2026-01-20T10:35:00Z",
  "pending_action": null
}
```

### Context Rules

| Rule | Behavior |
|------|----------|
| **Entry** | Tap buyer card, type code, or name match |
| **Persistence** | Stays until exit, new buyer, or timeout |
| **Timeout** | 15 minutes of inactivity |
| **Exit triggers** | "done", "next", "all", "back", timeout |
| **Override** | Mentioning another buyer switches context |

### Disambiguation Rules

| Scenario | Bot Behavior |
|----------|--------------|
| Exact name match | Proceed immediately |
| Single partial match | Proceed with confirmation |
| Multiple matches | Show list, ask to select |
| No match | Suggest similar names or create new |
| Code used | Always unambiguous, proceed immediately |

---

## Part 10: Backend Architecture

### New Files

```
backend/app/
├── routers/
│   └── whatsapp.py              # Webhook endpoints
├── services/
│   ├── whatsapp/
│   │   ├── __init__.py
│   │   ├── client.py            # Meta Cloud API client
│   │   ├── session.py           # Session state management
│   │   ├── intent.py            # Message → Intent parsing
│   │   ├── handlers.py          # Intent → Action execution
│   │   ├── messages.py          # Response formatting
│   │   └── buyer_codes.py       # Code generation (SC1, MJ1)
```

### Database Changes

```sql
-- Agent WhatsApp connection
ALTER TABLE agents 
ADD COLUMN whatsapp_phone TEXT UNIQUE,
ADD COLUMN whatsapp_connected_at TIMESTAMP;

-- Buyer codes (unique per agent)
ALTER TABLE buyer_profiles
ADD COLUMN whatsapp_code TEXT;

-- Ensure uniqueness per agent
CREATE UNIQUE INDEX idx_buyer_code_per_agent 
ON buyer_profiles(agent_id, whatsapp_code);

-- WhatsApp message log (for debugging & compliance)
CREATE TABLE whatsapp_messages (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id),
    direction TEXT NOT NULL,  -- 'inbound' | 'outbound'
    wa_message_id TEXT UNIQUE,
    message_type TEXT,  -- 'text' | 'interactive' | 'voice'
    content JSONB,
    processed_at TIMESTAMP DEFAULT NOW()
);
```

### Code Generation Logic

```python
def generate_buyer_code(agent_id: int, first_name: str, last_name: str) -> str:
    """Generate unique buyer code like SC1, SC2, MJ1"""
    base = (first_name[0] + last_name[0]).upper()
    
    # Find existing codes for this agent with same base
    existing = get_buyer_codes_for_agent(agent_id, base_prefix=base)
    
    if not existing:
        return f"{base}1"
    
    # Find next available number
    numbers = [int(code[2:]) for code in existing]
    next_num = max(numbers) + 1
    
    return f"{base}{next_num}"
```

---

## Part 11: API Mapping

| User Action | Backend API(s) |
|-------------|----------------|
| View buyer list | `GET /api/buyer-profiles` |
| Select buyer | `GET /api/buyer-profiles/{id}` |
| Create buyer | `POST /api/extract-profile` → `POST /api/buyer-profiles` |
| Edit buyer (NL) | `POST /api/buyer-profiles/{id}/parse-changes` → `PATCH .../apply-changes` |
| Search | `POST /api/agent-search` |
| Get search status | `GET /api/agent-search/{profile_id}` |
| Run photo analysis | `GET /api/agent-search/photos?searchId=...` |
| Generate report | `POST /api/buyer-reports` |
| Send report | `POST /api/buyer-reports/{id}/send-email` |
| View buyer notes | `GET /api/buyer-reports/{share_id}` → extract `buyerNotes` |

---

## Part 12: Rollout Plan

### Phase 1: Foundation (Week 1-2)
- [ ] WhatsApp webhook setup & verification
- [ ] Agent phone registration in dashboard
- [ ] Session state management (Redis)
- [ ] Buyer code generation
- [ ] Basic message parsing

**Deliverable**: Agent can connect WhatsApp, view buyer list

### Phase 2: Read Operations (Week 3-4)
- [ ] Daily briefing
- [ ] Buyer list with filtering
- [ ] Buyer detail view
- [ ] View saved properties
- [ ] View report notes/feedback

**Deliverable**: Agent can browse all buyer data

### Phase 3: Search & Reports (Week 5-6)
- [ ] Trigger search for buyer
- [ ] Poll for search completion
- [ ] Display search results
- [ ] Generate report
- [ ] Send report via email

**Deliverable**: Complete search → report → send flow

### Phase 4: Write Operations (Week 7-8)
- [ ] Create new buyer (NLP extraction)
- [ ] Edit buyer profile (conversational)
- [ ] Confirm/undo actions

**Deliverable**: Full CRUD on buyer profiles

### Phase 5: Polish & Notifications (Week 9-10)
- [ ] Voice note transcription
- [ ] Proactive notifications (price drops, buyer responses)
- [ ] Error handling edge cases
- [ ] Performance optimization

**Deliverable**: Production-ready release

---

## Part 13: Environment Variables

```env
# WhatsApp Cloud API (Meta)
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxx
WHATSAPP_VERIFY_TOKEN=your-random-verify-token
WHATSAPP_APP_SECRET=your-app-secret-for-signature

# Session storage
REDIS_URL=redis://localhost:6379/1

# Existing
FRONTEND_BASE_URL=https://app.residenthive.com
OPENAI_API_KEY=sk-...  # For voice transcription
```

---

## Part 14: Security

| Concern | Mitigation |
|---------|------------|
| Webhook authenticity | Verify `X-Hub-Signature-256` with app secret |
| Agent identity | Phone number verified during registration |
| Session hijacking | Sessions tied to phone + agent_id |
| Message replay | Deduplicate by `wa_message_id` |
| Data access | All queries scoped to `agent_id` (existing multi-tenant) |
| Audit trail | Log all messages to `whatsapp_messages` table |
| Rate limiting | Max 30 messages/minute per agent |

---

## Part 15: Open Questions

1. **Voice notes**: Transcribe with Whisper or use WhatsApp's transcription?
2. **Media sharing**: Should agents be able to send property photos directly?
3. **Group chats**: Support agent + buyer in same WhatsApp group?
4. **Offline queue**: What if backend is down when message arrives?
5. **Multi-language**: Support Spanish/other languages?
6. **Cost model**: Who pays for WhatsApp API costs? (Per-conversation pricing)

---

## Appendix: Sample Conversations

### Complete Flow: New Lead to Sent Report

```
Agent: "new"

Bot:   "📝 Tell me about your new buyer..."

Agent: "Jennifer Lee, jen@email.com, wants to buy in Medford
        Budget 500-600K, needs 3 beds, good commute to downtown"

Bot:   "✅ Created Jennifer Lee (JL1)
        📍 Medford · 💰 $500-600K · 🛏️ 3bd
        ✓ Good commute to downtown
        
        [Search Now] [Edit First]"

Agent: [Taps "Search Now"]

Bot:   "🔍 Searching for Jennifer Lee (JL1)...
        ⏳ Please wait ~30 seconds"

Bot:   "✅ Found 28 properties for Jennifer Lee
        
        🥇 15 Forest St - $545K - 94% match
        🥈 22 Main Ave - $580K - 91% match
        🥉 8 Park Rd - $525K - 88% match
        
        [Generate Report] [See All 5] [Adjust Search]"

Agent: [Taps "Generate Report"]

Bot:   "📄 Report ready for Jennifer Lee
        🔗 app.residenthive.com/report/xyz789
        
        [Send to Jennifer] [Preview] [Edit]"

Agent: [Taps "Send to Jennifer"]

Bot:   "📧 Sent to jen@email.com
        
        Subject: Homes I'd recommend for Jennifer
        5 properties with your AI analysis
        
        [View Report] [Done with Jennifer]"

Agent: [Taps "Done with Jennifer"]

Bot:   "✅ Finished with Jennifer Lee (JL1)
        
        📥 What's next?
        [View All Buyers] [Next Priority] [Create New]"
```

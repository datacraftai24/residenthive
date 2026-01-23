# ResidenceHive Integration Tests

## Overview

This document describes manual integration tests for the ResidenceHive platform. Run these tests after making significant changes to verify core functionality.

## Prerequisites

1. **Local environment running:**
   ```bash
   docker compose up -d
   ```

2. **Backend healthy:**
   ```bash
   curl http://localhost:8001/health
   ```

3. **Frontend accessible:**
   - Open http://localhost:3001 in Chrome
   - Sign in with your Clerk account

---

## Test 1: Profile Creation

**Purpose:** Verify buyer profiles can be created via the UI

**Steps:**
1. Navigate to http://localhost:3001/dashboard
2. Ensure "Structured Form" tab is selected
3. Fill in:
   - Buyer Name: `Integration Test User`
   - Email: `integration-test-{timestamp}@example.com` (use unique email)
   - Location: `Boston, MA`
   - Budget: `$500K - $700K`
4. Click "Create Enhanced Profile"

**Expected Result:**
- Profile appears in "Saved Profiles" sidebar
- Profile shows correct budget and location
- Database has one record:
  ```sql
  SELECT * FROM buyer_profiles WHERE email = 'integration-test-{timestamp}@example.com';
  ```

---

## Test 2: Duplicate Profile Prevention

**Purpose:** Verify duplicate profiles are not created for the same email

**Steps:**
1. Complete Test 1 first
2. Fill form again with SAME email but different name
3. Click "Create Enhanced Profile"

**Expected Result:**
- No new profile created
- Existing profile returned
- Database still has only ONE record for that email:
  ```sql
  SELECT COUNT(*) FROM buyer_profiles
  WHERE email = 'integration-test-{timestamp}@example.com';
  -- Should return 1
  ```

**Verification Query:**
```sql
-- Check no duplicates exist for any email
SELECT email, agent_id, COUNT(*)
FROM buyer_profiles
WHERE email IS NOT NULL AND email != ''
GROUP BY email, agent_id
HAVING COUNT(*) > 1;
-- Should return 0 rows
```

---

## Test 3: Lead Creation via Quick Voice/Text

**Purpose:** Verify leads can be created and processed via the UI

**Steps:**
1. Navigate to http://localhost:3001/dashboard
2. Click "Quick Voice/Text" tab
3. In "Paste lead message here" textarea, enter:
   ```
   Hi, I am looking for a 3 bedroom house in Boston MA.
   My budget is around $800K.
   Please contact me at test-lead-{timestamp}@example.com.
   Thanks, John Test
   ```
4. Click "Process Lead"

**Expected Result:**
- Lead is processed and extracted data shows:
  - Name: John Test
  - Email: test-lead-{timestamp}@example.com
  - Location: Boston
  - Budget: $800K
  - Bedrooms: 3
- Classification shows: BUYER LEAD, area search

**Verification Query:**
```sql
SELECT id, extracted_name, extracted_email, extracted_location,
       extracted_budget, extracted_bedrooms, status
FROM leads
WHERE extracted_email = 'test-lead-{timestamp}@example.com';
```

---

## Test 4: Lead Duplicate Prevention (Database Level)

**Purpose:** Verify unique constraints prevent duplicate profiles from leads

**Verification:**
```sql
-- Check unique constraint exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'buyer_profiles'
AND indexname LIKE 'idx_unique%';

-- Expected:
-- idx_unique_profile_per_agent_email
-- idx_unique_profile_per_lead
```

---

## Test 5: Generate Report

**Purpose:** Verify report generation flow

**Prerequisites:**
- Lead must be created (Test 3)
- Lead must have valid location with MLS coverage

**Steps:**
1. After processing a lead, click "Generate Report" button
2. Wait for report generation (10-30 seconds)

**Expected Result:**
- If properties found: New tab opens with buyer report
- If no properties: 400 error (check logs for "Persisted 0 listings")

**Note:** Report generation depends on Repliers API returning listings for the specified location. Test with locations known to have MLS coverage (e.g., Boston, Newton, Quincy).

---

## Database Health Checks

Run these queries to verify database integrity:

```sql
-- 1. Check for duplicate profiles (should return 0 rows)
SELECT email, agent_id, COUNT(*) as cnt
FROM buyer_profiles
WHERE email IS NOT NULL AND email != ''
GROUP BY email, agent_id
HAVING COUNT(*) > 1;

-- 2. Check for orphaned lead conversions (should return 0 rows)
SELECT l.id, l.converted_profile_id
FROM leads l
LEFT JOIN buyer_profiles p ON l.converted_profile_id = p.id
WHERE l.converted_profile_id IS NOT NULL
AND p.id IS NULL;

-- 3. Verify unique constraints exist
SELECT indexname FROM pg_indexes
WHERE tablename = 'buyer_profiles'
AND indexname LIKE 'idx_unique%';
```

---

## Automated Test Commands

For CI/CD integration, use these curl commands:

```bash
# Health check
curl -s http://localhost:8001/health | jq .status

# Get profiles (requires auth)
curl -s http://localhost:8001/api/buyer-profiles \
  -H "Authorization: Bearer $TOKEN" | jq length

# Get leads (requires auth)
curl -s http://localhost:8001/api/leads \
  -H "Authorization: Bearer $TOKEN" | jq length
```

---

## Troubleshooting

### Report Generation Returns 400
- Check backend logs: `docker logs residenthive-backend --tail 50`
- Look for "Persisted 0 listings" - indicates no properties found
- Verify location has MLS coverage

### Profile Creation Fails
- Check for UniqueViolation in logs
- Verify email format is valid
- Check agent_id is set correctly

### Lead Processing Slow
- Check OpenAI API connectivity
- Review logs for extraction errors

---

## Migration Verification

After running migration `024_prevent_duplicate_profiles.sql`:

```sql
-- Verify constraints created
\d+ buyer_profiles

-- Check for idx_unique_profile_per_agent_email
-- Check for idx_unique_profile_per_lead
```

---

*Last updated: 2026-01-23*
*Run these tests when: deploying changes, after migrations, debugging issues*

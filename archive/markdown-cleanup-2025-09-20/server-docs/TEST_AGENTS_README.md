# Testing the New Config-Driven Agents

## Quick Start

Run these commands to test the new agent architecture:

```bash
# Test the config system
npm run test:config

# Test MarketDiscoveryAgent with configs
npm run test:market

# Test DataReconciliation with configs
npm run test:reconcile

# Run all agent tests
npm run test:all-agents

# Run comprehensive test suite
npm run test:agents
```

## What Each Test Does

### 1. `test:config` - Config System Test
Tests the ConfigRegistry:
- Reading/writing config values
- Schema validation
- TTL and expiry
- Audit logging
- Source weight updates

### 2. `test:market` - Market Discovery Test
Tests MarketDiscoveryAgent:
- Uses config-driven source weights
- Uses config-driven freshness requirements
- Uses config-driven cross-checks
- Discovers markets based on research (mocked)

### 3. `test:reconcile` - Data Reconciliation Test
Tests DataReconciliationAgent:
- Reconciles conflicting data from multiple sources
- Applies source weights from config
- Uses metric tolerances from config
- Handles data freshness/staleness

### 4. `test:agents` - Comprehensive Test
Runs all tests in sequence with detailed output.

## Testing Individual Components

### Test Config Updates Only
```bash
tsx server/test-config-updates.ts
```

### Test with Real Tavily API
Set your Tavily API key and modify the test to use real search:
```bash
export TAVILY_API_KEY=your-key-here
# Then modify mockTavily to use real API
```

### Test with Database
The tests will use your configured database. Make sure to run migrations first:
```bash
npm run db:migrate
npm run db:push
```

## Expected Output

When tests run successfully, you should see:

1. **Config Test**: Shows config values being read/written with audit trails
2. **Market Discovery**: Lists discovered markets with scores and recommendations
3. **Reconciliation**: Shows how conflicting data is weighted and merged
4. **All Tests**: Summary showing all tests passed

## Common Issues

### Database Not Initialized
If you see database errors:
```bash
npm run db:migrate
npm run db:push
```

### Config Files Missing
The system should auto-load seed configs from `/server/config/seeds/`.
If not, check that these JSON files exist:
- market-data.json
- policy.json
- source-weights.json
- reconciliation.json
- county-mapping.json

### Import Errors
Make sure TypeScript is configured for ESM:
```bash
npm run check  # Type check
npm run build  # Build the project
```

## Debugging

### Enable LLM Prompt Logging
```bash
export LOG_LLM_PROMPTS=true
npm run test:market
```

### Check Config Values
```bash
# Quick script to dump current configs
tsx -e "
import { configRegistry } from './server/config/config-registry.js';
await configRegistry.initialize();
const sw = await configRegistry.getValue('source-weights');
console.log('Source Weights:', sw);
"
```

### Test Specific Scenarios

Edit the test files to modify:
- `TEST_PROFILE` - Change investor profile
- `mockTavily` - Change mock search responses
- `conflictingFindings` - Test different data conflicts

## Architecture Overview

```
ConfigRegistry (Single source of truth)
    ↓
├── MarketDiscoveryAgent
│   ├── Uses source weights for trust
│   ├── Uses freshness requirements
│   └── Uses cross-checks for validation
│
├── DataReconciliationAgent
│   ├── Uses source weights for reconciliation
│   ├── Uses metric tolerances
│   └── Updates weights based on accuracy
│
└── ConfigUpdater
    ├── Updates mortgage rates from research
    ├── Updates tax rates from findings
    └── Adjusts weights based on performance
```

## Next Steps

After testing, you can:

1. **Use the API** to update configs:
```bash
curl -X PUT http://localhost:3000/api/config/market-data \
  -H "Content-Type: application/json" \
  -d '{"value": {...}, "ttl": 3600}'
```

2. **Monitor agent updates** in the audit log:
```bash
curl http://localhost:3000/api/config/market-data/audit
```

3. **Let agents update configs** based on their research - they'll do this automatically when they find new data!
# Investment Advisor System - File Cleanup Guide
## Pre-Commit Categorization for GitHub Push

### ✅ CORE FILES - MUST COMMIT (Investment Advisor System)

#### 1. **Core Services & Agents**
```
server/services/ai-investment-advisor.ts          ✅ CORE - Main orchestrator with error handling
server/services/investment-chat-simplified.ts     ✅ CORE - Enhanced chat with agent insights
server/services/research-mesh.ts                  ✅ CORE - Market research integration
server/services/fact-store.ts                     ✅ CORE - Knowledge persistence
server/services/strategy-builder.ts               ✅ CORE - Strategy generation
server/services/market-discovery.ts               ✅ CORE - Market opportunity finder
server/services/property-enricher.ts              ✅ CORE - Property data enhancement
```

#### 2. **AI Agents (New Architecture)**
```
server/ai-agents/                                 ✅ CORE - All new agent implementations
  ├── property-scoring-agent.ts                   ✅ CORE - Smart scoring with error handling
  ├── strategy-mind-agent.ts                      ✅ CORE - Strategy development
  ├── market-scout-agent.ts                       ✅ CORE - Market analysis
  └── deal-packager-agent.ts                      ✅ CORE - Recommendation packaging
```

#### 3. **Enhanced Financial Calculator**
```
server/agents/financial-calculator-smart.ts       ✅ CORE - Realistic financial analysis
```

#### 4. **Database Schema**
```
server/db/schema-agent-insights.ts                ✅ CORE - Agent knowledge capture
```

#### 5. **API Routes**
```
server/routes/ai-investment-advisor.ts            ✅ CORE - Main API endpoint
server/routes/investment-routes-enhanced.ts       ✅ CORE - Enhanced routes
```

#### 6. **Frontend Components**
```
client/src/components/investment-strategy.tsx     ✅ CORE - Investment chat UI
client/src/pages/dashboard.tsx                    ✅ MODIFIED - Fixed agent validation
```

#### 7. **Observability**
```
server/observability/                             ✅ CORE - Tracing and monitoring
  ├── withSpan.ts                                 ✅ CORE - Span wrapper
  ├── llm-tracer.ts                               ✅ CORE - LLM call tracing
  └── config.ts                                   ✅ CORE - Observability config
```

#### 8. **Package Updates**
```
package.json                                      ✅ COMMIT - New dependencies
package-lock.json                                 ✅ COMMIT - Lock file
```

---

### 🧹 CLEANUP BEFORE COMMIT

#### 1. **Test & Debug Files** - DELETE
```
server/debug-multi-agent.ts                       ❌ DELETE - Debug script
test-phoenix-simple.ts                            ❌ DELETE - Test file
test-trace-export.ts                              ❌ DELETE - Test file
test-frontend.html                                ❌ DELETE - Test HTML
server/agents/instrumented-agents.ts              ❌ DELETE - Debug wrapper
server/agents/instrumented-orchestrator.ts        ❌ DELETE - Debug wrapper
```

#### 2. **Old/Duplicate Services** - DELETE
```
server/services/gap-detector-fixed.ts             ❌ DELETE - Duplicate/fixed version
server/services/fact-store-health.ts              ❌ DELETE - Monitoring script
server/services/fact-store-monitor.ts             ❌ DELETE - Monitoring script
server/services/strategy-verifier.ts              ❌ DELETE - Unused
server/services/scenario-engine.ts                ❌ DELETE - Unused
server/services/strategy-research-coordinator.ts  ❌ DELETE - Replaced by new system
```

#### 3. **Local Development Files** - DON'T COMMIT
```
docker-compose.dev.yml                            ⚠️ LOCAL - Dev Docker config
Dockerfile.dev                                    ⚠️ LOCAL - Dev Dockerfile
create-admin.sh                                   ⚠️ LOCAL - Admin creation script
start-local.sh                                    ⚠️ LOCAL - Local startup script
.env.example                                      ✅ COMMIT - But review for secrets
```

#### 4. **Generated Directories** - ADD TO .gitignore
```
logs/                                             ⚠️ GITIGNORE - Runtime logs
data/                                             ⚠️ GITIGNORE - Local data
debug-output/                                     ⚠️ GITIGNORE - Debug outputs
reports/                                          ⚠️ GITIGNORE - Generated reports
strategies/*.md                                   ⚠️ GITIGNORE - Generated strategies
```

#### 5. **Documentation** - REVIEW & COMMIT
```
INVESTMENT_ADVISOR_FRD.md                         ✅ COMMIT - Functional requirements
AI-SYSTEM-REFERENCE.md                            📝 REVIEW - May have sensitive info
AI-ADAPTIVE-SYSTEM-REFERENCE.md                   📝 REVIEW - May have sensitive info
INVESTMENT_INTELLIGENCE_REFERENCE.md              📝 REVIEW - May have sensitive info
OBSERVABILITY_PLAN.md                             📝 REVIEW - Internal planning doc
REPLIERS_SEARCH_STRATEGY.md                       📝 REVIEW - Internal strategy
```

#### 6. **Modified Legacy Files** - REVIEW CHANGES
```
server/agents/agent-orchestrator.ts               📝 REVIEW - Check if changes needed
server/agents/deal-packager.ts                    📝 REVIEW - Check if changes needed
server/agents/financial-calculator.ts             📝 REVIEW - Old version, may not need
server/agents/property-hunter.ts                  📝 REVIEW - Check if changes needed
server/agents/property-hunter-strategic.ts        📝 REVIEW - May be duplicate
server/agents/real-estate-advisor.ts              📝 REVIEW - Check if changes needed
server/agents/strategy-builder.ts                 📝 REVIEW - Old version
server/index.ts                                   ✅ COMMIT - Has route registrations
server/repliers-api.ts                            📝 REVIEW - Check changes
```

---

### 📋 CLEANUP COMMANDS

```bash
# 1. Remove test and debug files
rm server/debug-multi-agent.ts
rm test-phoenix-simple.ts
rm test-trace-export.ts
rm test-frontend.html
rm server/agents/instrumented-*.ts

# 2. Remove unused services
rm server/services/gap-detector-fixed.ts
rm server/services/fact-store-health.ts
rm server/services/fact-store-monitor.ts
rm server/services/strategy-verifier.ts
rm server/services/scenario-engine.ts
rm server/services/strategy-research-coordinator.ts

# 3. Clean generated directories
rm -rf debug-output/
rm -rf reports/
rm -rf strategies/*.md

# 4. Update .gitignore
cat >> .gitignore << 'EOF'

# Investment Advisor Generated Files
logs/
data/
debug-output/
reports/
strategies/*.md
*.log
checkpoint-*.json

# Local Development
docker-compose.dev.yml
Dockerfile.dev
create-admin.sh
start-local.sh
EOF

# 5. Review changes to legacy files
git diff server/agents/agent-orchestrator.ts
git diff server/agents/property-hunter.ts
# ... review each modified legacy file

# 6. Stage only required files
git add server/services/ai-investment-advisor.ts
git add server/services/investment-chat-simplified.ts
git add server/services/research-mesh.ts
git add server/services/fact-store.ts
git add server/ai-agents/
git add server/agents/financial-calculator-smart.ts
git add server/db/schema-agent-insights.ts
git add server/routes/ai-investment-advisor.ts
git add server/routes/investment-routes-enhanced.ts
git add server/observability/
git add client/src/components/investment-strategy.tsx
git add client/src/pages/dashboard.tsx
git add package.json package-lock.json
git add INVESTMENT_ADVISOR_FRD.md

# 7. Check what will be committed
git status
```

---

### 🚀 FINAL CHECKLIST BEFORE PUSH

- [ ] All test/debug files removed
- [ ] No API keys or secrets in committed files
- [ ] .gitignore updated with generated directories
- [ ] Only investment advisor core files staged
- [ ] package.json dependencies reviewed
- [ ] Documentation files reviewed for sensitive info
- [ ] Legacy file changes reviewed and necessary ones kept
- [ ] Local dev files (docker-compose.dev.yml) not staged

### 📊 SUMMARY

**Files to Commit: ~25-30 files**
- Core services: 7 files
- AI agents: 4-5 files  
- Routes: 2 files
- Frontend: 2 files
- Database: 1 file
- Observability: 3-4 files
- Package files: 2 files
- Documentation: 1-2 files

**Files to Delete: ~15 files**
**Files to Ignore: ~10 directories/patterns**
**Files to Review: ~10 files**

This will give you a clean, focused commit with only the investment advisor system changes ready for Replit deployment.
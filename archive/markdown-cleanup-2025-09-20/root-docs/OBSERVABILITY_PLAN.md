# Multi-Agent System Observability Implementation Plan

## Phase 1: Phoenix Integration (Week 1)

### 1.1 Setup Phoenix Locally
```bash
# Install Phoenix
pip install arize-phoenix
phoenix serve  # Starts at http://localhost:6006

# Or use Docker
docker run -p 6006:6006 arizephoenix/phoenix:latest
```

### 1.2 Instrument ResidentHive Agents
```typescript
// server/observability/phoenix-tracer.ts
import { trace } from '@opentelemetry/api';
import { PhoenixTracer } from './phoenix-client';

export class AgentTracer {
  private tracer: PhoenixTracer;
  
  async traceAgent(agentName: string, method: string, input: any, fn: Function) {
    const span = this.tracer.startSpan(`${agentName}.${method}`);
    
    span.setAttributes({
      'agent.name': agentName,
      'agent.method': method,
      'input.type': typeof input,
      'input.content': JSON.stringify(input)
    });
    
    try {
      const result = await fn();
      span.setAttributes({
        'output.type': typeof result,
        'output.content': JSON.stringify(result)
      });
      return result;
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }
}
```

### 1.3 Wrap Each Agent
```typescript
// agents/instrumented-agent.ts
export function instrumentAgent<T>(agent: T, agentName: string): T {
  return new Proxy(agent, {
    get(target, prop) {
      if (typeof target[prop] === 'function') {
        return async (...args) => {
          return tracer.traceAgent(
            agentName,
            prop.toString(),
            args,
            () => target[prop](...args)
          );
        };
      }
      return target[prop];
    }
  });
}
```

## Phase 2: LLM Call Instrumentation (Week 1-2)

### 2.1 OpenAI Integration
```typescript
// server/observability/openai-instrumentation.ts
import { OpenAI } from 'openai';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

export function instrumentOpenAI(client: OpenAI) {
  const originalCreate = client.chat.completions.create;
  
  client.chat.completions.create = async function(params) {
    const span = tracer.startSpan('openai.chat.completion');
    
    span.setAttributes({
      'llm.vendor': 'openai',
      'llm.model': params.model,
      'llm.temperature': params.temperature,
      'llm.max_tokens': params.max_tokens,
      'llm.prompt': JSON.stringify(params.messages),
      'llm.tools': params.tools ? JSON.stringify(params.tools) : undefined
    });
    
    const startTime = Date.now();
    
    try {
      const response = await originalCreate.call(this, params);
      
      span.setAttributes({
        'llm.response': JSON.stringify(response.choices[0].message),
        'llm.usage.prompt_tokens': response.usage?.prompt_tokens,
        'llm.usage.completion_tokens': response.usage?.completion_tokens,
        'llm.usage.total_tokens': response.usage?.total_tokens,
        'llm.latency_ms': Date.now() - startTime
      });
      
      return response;
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  };
  
  return client;
}
```

### 2.2 Tavily API Instrumentation
```typescript
// server/observability/tavily-instrumentation.ts
export function instrumentTavily(tavilyClient: any) {
  const originalSearch = tavilyClient.search;
  
  tavilyClient.search = async function(query: string) {
    const span = tracer.startSpan('tavily.search');
    
    span.setAttributes({
      'search.query': query,
      'search.vendor': 'tavily'
    });
    
    try {
      const result = await originalSearch.call(this, query);
      span.setAttributes({
        'search.results_count': result.results?.length || 0
      });
      return result;
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  };
}
```

## Phase 3: Agent Orchestration Tracking (Week 2)

### 3.1 Track Agent Dependencies
```typescript
// server/observability/orchestration-tracker.ts
export class OrchestrationTracker {
  private flowId: string;
  private agentSequence: Array<{
    agent: string;
    startTime: number;
    endTime?: number;
    input: any;
    output?: any;
    error?: any;
  }> = [];
  
  startFlow(userInput: string) {
    this.flowId = generateFlowId();
    this.logEvent('flow.start', { userInput });
  }
  
  trackAgent(agentName: string, phase: 'start' | 'end', data: any) {
    if (phase === 'start') {
      this.agentSequence.push({
        agent: agentName,
        startTime: Date.now(),
        input: data
      });
    } else {
      const agent = this.agentSequence.find(a => a.agent === agentName && !a.endTime);
      if (agent) {
        agent.endTime = Date.now();
        agent.output = data;
      }
    }
    
    this.logEvent(`agent.${phase}`, {
      agent: agentName,
      flowId: this.flowId,
      data
    });
  }
  
  generateFlowDiagram() {
    // Generate Mermaid diagram of agent flow
    return this.agentSequence.map(agent => 
      `${agent.agent}[${agent.endTime - agent.startTime}ms]`
    ).join(' --> ');
  }
}
```

### 3.2 Real-time Dashboard
```typescript
// server/observability/dashboard.ts
export class ObservabilityDashboard {
  private ws: WebSocket;
  
  sendMetrics() {
    const metrics = {
      activeFlows: this.getActiveFlows(),
      agentPerformance: {
        strategyBuilder: { avgTime: 1200, successRate: 0.98 },
        marketResearcher: { avgTime: 3000, successRate: 0.95 },
        propertyHunter: { avgTime: 5000, successRate: 0.92 },
        financialCalculator: { avgTime: 2000, successRate: 0.99 }
      },
      llmUsage: {
        totalTokens: this.getTotalTokens(),
        estimatedCost: this.getEstimatedCost(),
        requestCount: this.getRequestCount()
      }
    };
    
    this.ws.send(JSON.stringify(metrics));
  }
}
```

## Phase 4: Evaluation Framework (Week 2-3)

### 4.1 Quality Metrics
```typescript
// server/evaluation/quality-metrics.ts
export class QualityEvaluator {
  async evaluateStrategyQuality(strategy: any) {
    return {
      completeness: this.checkCompleteness(strategy),
      accuracy: await this.checkAccuracy(strategy),
      relevance: this.checkRelevance(strategy),
      coherence: this.checkCoherence(strategy)
    };
  }
  
  checkCompleteness(strategy: any): number {
    const requiredFields = [
      'executiveSummary',
      'purchasingPower',
      'marketAnalysis',
      'propertyRecommendations',
      'financialProjections'
    ];
    
    const present = requiredFields.filter(field => 
      strategy[field] && Object.keys(strategy[field]).length > 0
    );
    
    return present.length / requiredFields.length;
  }
  
  async checkAccuracy(strategy: any): Promise<number> {
    // Validate calculations
    const calculations = strategy.financialProjections;
    const recalculated = await this.recalculateFinancials(strategy);
    
    const deviation = Math.abs(
      calculations.totalReturn - recalculated.totalReturn
    ) / recalculated.totalReturn;
    
    return Math.max(0, 1 - deviation);
  }
}
```

### 4.2 Performance Metrics
```typescript
// server/evaluation/performance-metrics.ts
export class PerformanceEvaluator {
  trackAgentMetrics() {
    return {
      latency: {
        p50: this.getPercentile(50),
        p95: this.getPercentile(95),
        p99: this.getPercentile(99)
      },
      throughput: this.getRequestsPerMinute(),
      errorRate: this.getErrorRate(),
      tokenEfficiency: this.getTokensPerRequest()
    };
  }
}
```

## Phase 5: Integration & Testing (Week 3)

### 5.1 Environment Setup
```yaml
# docker-compose.observability.yml
version: '3.8'
services:
  phoenix:
    image: arizephoenix/phoenix:latest
    ports:
      - "6006:6006"
    environment:
      - PHOENIX_WORKING_DIR=/data
    volumes:
      - ./phoenix-data:/data
  
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    volumes:
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
  
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
```

### 5.2 Testing Framework
```typescript
// tests/observability.test.ts
describe('Agent Observability', () => {
  it('should trace all agent interactions', async () => {
    const trace = await captureTrace(async () => {
      await orchestrator.executeComprehensiveAnalysis(testInput);
    });
    
    expect(trace.spans).toContainEqual(
      expect.objectContaining({
        name: 'StrategyBuilder.analyzeInvestorRequirements'
      })
    );
  });
  
  it('should track LLM token usage', async () => {
    const metrics = await getMetrics();
    expect(metrics.llm.totalTokens).toBeGreaterThan(0);
    expect(metrics.llm.cost).toBeDefined();
  });
});
```

## Implementation Timeline

### Week 1
- [ ] Set up Phoenix locally
- [ ] Instrument OpenAI calls
- [ ] Create basic agent wrappers
- [ ] Deploy to development environment

### Week 2  
- [ ] Implement orchestration tracking
- [ ] Add Tavily instrumentation
- [ ] Create evaluation metrics
- [ ] Build real-time dashboard

### Week 3
- [ ] Integration testing
- [ ] Performance optimization
- [ ] Documentation
- [ ] Production deployment

## Success Metrics

1. **Visibility**: 100% of agent interactions traced
2. **Performance**: < 5% overhead from instrumentation
3. **Debugging**: Reduce debug time by 70%
4. **Quality**: Automated quality scores for all strategies
5. **Cost**: Track and optimize LLM token usage

## Tools Comparison

| Feature | Phoenix | LangSmith | W&B | OpenLLMetry |
|---------|---------|-----------|-----|-------------|
| Open Source | ✅ | ❌ | Partial | ✅ |
| Real-time Tracing | ✅ | ✅ | ✅ | ✅ |
| Cost Tracking | ✅ | ✅ | ✅ | Manual |
| Agent Visualization | ✅ | ✅ | ❌ | ❌ |
| Custom Metrics | ✅ | Limited | ✅ | ✅ |
| Self-hosted | ✅ | ❌ | ❌ | ✅ |

## Recommended Stack

1. **Primary**: Arize Phoenix (tracing & visualization)
2. **Metrics**: Prometheus + Grafana (performance monitoring)
3. **Logs**: Structured logging with Pino
4. **Evaluation**: Custom framework with Phoenix integration
5. **Storage**: PostgreSQL for trace persistence
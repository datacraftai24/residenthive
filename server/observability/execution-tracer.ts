/**
 * Execution Tracer - Core observability system for ResidentHive
 * 
 * After 60 days of development, we're adding proper tracing to understand:
 * - Why minPrice calculations result in unexpected values
 * - How properties flow through evaluation phases
 * - What decisions are made and why
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface TraceEvent {
  timestamp: string;
  sessionId: string;
  phase: string;
  component: string;
  action: string;
  input?: any;
  output?: any;
  decision?: {
    type: string;
    reason: string;
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  error?: {
    message: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
  duration?: number;
}

export interface TraceContext {
  sessionId: string;
  userId?: string;
  requestId?: string;
  parentSpan?: string;
}

class ExecutionTracer {
  private traces: Map<string, TraceEvent[]> = new Map();
  private currentContext: TraceContext | null = null;
  private traceDir: string;
  private enableConsoleLog: boolean;
  private enableFileLog: boolean;
  
  constructor() {
    this.traceDir = join(process.cwd(), 'execution-traces');
    this.enableConsoleLog = process.env.TRACE_CONSOLE === 'true';
    this.enableFileLog = process.env.TRACE_FILE !== 'false'; // Default to true
    
    // Ensure trace directory exists
    if (!existsSync(this.traceDir)) {
      mkdirSync(this.traceDir, { recursive: true });
    }
  }

  /**
   * Start a new trace session
   */
  startSession(sessionId: string, context?: Partial<TraceContext>): void {
    this.currentContext = {
      sessionId,
      ...context
    };
    
    if (!this.traces.has(sessionId)) {
      this.traces.set(sessionId, []);
    }
    
    this.trace({
      phase: 'SESSION_START',
      component: 'ExecutionTracer',
      action: 'Starting new trace session',
      metadata: context
    });
  }

  /**
   * Add a trace event
   */
  trace(event: Omit<TraceEvent, 'timestamp' | 'sessionId'>): void {
    if (!this.currentContext) {
      console.warn('No active trace session. Call startSession() first.');
      return;
    }

    const fullEvent: TraceEvent = {
      timestamp: new Date().toISOString(),
      sessionId: this.currentContext.sessionId,
      ...event
    };

    // Store in memory
    const sessionTraces = this.traces.get(this.currentContext.sessionId) || [];
    sessionTraces.push(fullEvent);
    this.traces.set(this.currentContext.sessionId, sessionTraces);

    // Log to console if enabled
    if (this.enableConsoleLog) {
      this.logToConsole(fullEvent);
    }

    // Log to file if enabled
    if (this.enableFileLog) {
      this.logToFile(fullEvent);
    }
  }

  /**
   * Trace a decision point
   */
  traceDecision(
    component: string,
    decisionType: string,
    input: any,
    output: any,
    reason: string,
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
  ): void {
    this.trace({
      phase: 'DECISION',
      component,
      action: `Making decision: ${decisionType}`,
      input,
      output,
      decision: {
        type: decisionType,
        reason,
        confidence
      }
    });
  }

  /**
   * Trace a filter operation
   */
  traceFilter(
    component: string,
    filterName: string,
    itemsIn: number,
    itemsOut: number,
    criteria: any,
    filtered?: any[]
  ): void {
    this.trace({
      phase: 'FILTER',
      component,
      action: `Applying filter: ${filterName}`,
      input: { count: itemsIn, criteria },
      output: { count: itemsOut, filtered: filtered?.slice(0, 3) }, // Sample for logs
      metadata: {
        reductionRate: ((itemsIn - itemsOut) / itemsIn * 100).toFixed(1) + '%',
        passed: itemsOut,
        filtered: itemsIn - itemsOut
      }
    });
  }

  /**
   * Trace a calculation
   */
  traceCalculation(
    component: string,
    calculationType: string,
    inputs: Record<string, any>,
    result: any,
    formula?: string
  ): void {
    this.trace({
      phase: 'CALCULATION',
      component,
      action: `Calculating: ${calculationType}`,
      input: inputs,
      output: result,
      metadata: { formula }
    });
  }

  /**
   * Trace an API call
   */
  traceAPI(
    component: string,
    api: string,
    request: any,
    response: any,
    duration: number,
    error?: Error
  ): void {
    this.trace({
      phase: 'API_CALL',
      component,
      action: `Calling API: ${api}`,
      input: request,
      output: error ? undefined : response,
      error: error ? {
        message: error.message,
        stack: error.stack
      } : undefined,
      duration
    });
  }

  /**
   * Trace property evaluation
   */
  tracePropertyEvaluation(
    property: any,
    phase: 'SCREENING' | 'ANALYSIS' | 'SCORING',
    result: any,
    reason?: string
  ): void {
    this.trace({
      phase: 'PROPERTY_EVALUATION',
      component: 'PropertyEvaluator',
      action: `${phase}: ${property.address || property.id}`,
      input: {
        id: property.id,
        address: property.address,
        price: property.price,
        type: property.propertyType
      },
      output: result,
      decision: reason ? {
        type: phase,
        reason
      } : undefined
    });
  }

  /**
   * Get execution summary for a session
   */
  getSessionSummary(sessionId: string): any {
    const traces = this.traces.get(sessionId) || [];
    
    const summary = {
      sessionId,
      totalEvents: traces.length,
      startTime: traces[0]?.timestamp,
      endTime: traces[traces.length - 1]?.timestamp,
      duration: this.calculateDuration(traces),
      phases: this.groupByPhase(traces),
      decisions: traces.filter(t => t.phase === 'DECISION'),
      filters: traces.filter(t => t.phase === 'FILTER'),
      errors: traces.filter(t => t.error),
      apiCalls: traces.filter(t => t.phase === 'API_CALL')
    };

    return summary;
  }

  /**
   * Export session traces to file
   */
  exportSession(sessionId: string): string {
    const traces = this.traces.get(sessionId) || [];
    const summary = this.getSessionSummary(sessionId);
    
    const exportData = {
      summary,
      traces,
      exported: new Date().toISOString()
    };

    const filename = `trace-${sessionId}-${Date.now()}.json`;
    const filepath = join(this.traceDir, filename);
    
    writeFileSync(filepath, JSON.stringify(exportData, null, 2));
    
    return filepath;
  }

  /**
   * Create a child span for nested operations
   */
  span<T>(
    component: string,
    operation: string,
    fn: () => T | Promise<T>
  ): T | Promise<T> {
    const startTime = Date.now();
    
    this.trace({
      phase: 'SPAN_START',
      component,
      action: operation
    });

    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            this.trace({
              phase: 'SPAN_END',
              component,
              action: operation,
              duration: Date.now() - startTime,
              output: { success: true }
            });
            return value;
          },
          (error) => {
            this.trace({
              phase: 'SPAN_END',
              component,
              action: operation,
              duration: Date.now() - startTime,
              error: {
                message: error.message,
                stack: error.stack
              }
            });
            throw error;
          }
        );
      } else {
        this.trace({
          phase: 'SPAN_END',
          component,
          action: operation,
          duration: Date.now() - startTime,
          output: { success: true }
        });
        return result;
      }
    } catch (error: any) {
      this.trace({
        phase: 'SPAN_END',
        component,
        action: operation,
        duration: Date.now() - startTime,
        error: {
          message: error.message,
          stack: error.stack
        }
      });
      throw error;
    }
  }

  // Private helper methods
  
  private logToConsole(event: TraceEvent): void {
    const prefix = `[${event.timestamp}] [${event.sessionId.slice(0, 8)}] [${event.phase}]`;
    const message = `${prefix} ${event.component}::${event.action}`;
    
    if (event.error) {
      console.error(message, event.error);
    } else if (event.decision) {
      console.log(message, `Decision: ${event.decision.reason}`);
    } else {
      console.log(message);
    }
  }

  private logToFile(event: TraceEvent): void {
    const filename = `trace-${event.sessionId}-${new Date().toISOString().split('T')[0]}.jsonl`;
    const filepath = join(this.traceDir, filename);
    
    appendFileSync(filepath, JSON.stringify(event) + '\n');
  }

  private calculateDuration(traces: TraceEvent[]): number {
    if (traces.length < 2) return 0;
    
    const start = new Date(traces[0].timestamp).getTime();
    const end = new Date(traces[traces.length - 1].timestamp).getTime();
    
    return end - start;
  }

  private groupByPhase(traces: TraceEvent[]): Record<string, number> {
    const groups: Record<string, number> = {};
    
    for (const trace of traces) {
      groups[trace.phase] = (groups[trace.phase] || 0) + 1;
    }
    
    return groups;
  }
}

// Singleton instance
export const tracer = new ExecutionTracer();

// Helper functions for common operations
export function withTracing<T>(
  sessionId: string,
  component: string,
  operation: string,
  fn: () => T | Promise<T>
): T | Promise<T> {
  tracer.startSession(sessionId);
  return tracer.span(component, operation, fn);
}

// Export types for use in other modules
export type { TraceEvent, TraceContext };
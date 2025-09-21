/**
 * Production-Ready Agent Tracing Wrapper with Confidence Scoring
 * The ONLY place spans are created for agents
 */

import { trace, context, SpanKind, SpanStatusCode, Span } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import fs from 'fs';
import path from 'path';
import { resolveThresholds, ErrorCode, ObservabilityConfig } from './config.js';
import { AgentValidators } from './validators.js';
import { validateHandoff, HandoffSchemas } from './handoff-schemas.js';

// Initialize OpenTelemetry
let initialized = false;
let sdk: NodeSDK | null = null;

export function initTracing() {
  if (initialized) return;
  
  // Phoenix expects the collector endpoint, not the traces path
  const endpoint = process.env.PHOENIX_COLLECTOR_ENDPOINT || 'http://localhost:6007';
  
  // Configure the OTLP protobuf exporter for Phoenix
  const exporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
    headers: {},
  });

  // Create and configure SDK
  sdk = new NodeSDK({
    traceExporter: exporter,
    serviceName: 'residenthive-agents',
  });

  // Start the SDK
  try {
    sdk.start();
    console.log('🔭 OpenTelemetry initialized with protobuf exporter');
    console.log('📡 Sending traces to Phoenix at:', `${endpoint}/v1/traces`);
    initialized = true;
  } catch (error) {
    console.error('Failed to initialize OpenTelemetry:', error);
  }
}

initTracing();

// Export shutdown function to flush traces
export async function shutdownTracing() {
  if (sdk) {
    console.log('🛑 Shutting down OpenTelemetry SDK to flush traces...');
    try {
      await sdk.shutdown();
      console.log('✅ OpenTelemetry SDK shutdown complete');
    } catch (error) {
      console.error('Error shutting down SDK:', error);
    }
  }
}

// Ensure logs directory exists
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Validation result with confidence scoring
 */
export type ValidateResult = {
  complete: boolean;
  confidence?: number; // 0-1, how confident are we in this output?
  statusOverride?: 'ok' | 'missing_fields' | 'no_match' | 'calc_error' | 'tool_error' | 'invalid_type';
  missing_fields?: string[]; // Specific fields that are missing
  extraTags?: Record<string, any>;
};

// Agent names that map to validators
export type AgentName = keyof typeof AgentValidators;

/**
 * Span context for agent instrumentation
 */
export interface SpanContext {
  addTag(key: string, value: any): void;
  setHandoffStatus(status: 'valid' | 'incomplete' | 'invalid_type' | 'empty'): void;
  setGroundedRate(rate: number): void;
  statusOverride(status: ValidateResult['statusOverride']): void;
  setConfidence(confidence: number): void;
  recordTokenUsage(tokensIn: number, tokensOut: number, costUsd?: number): void;
}

/**
 * JSONL log entry for each agent hop
 */
interface AgentHopLog {
  ts: string;
  strategy_id: string;
  agent: string;
  status: ValidateResult['statusOverride'] | 'ok';
  handoff_status?: 'valid' | 'incomplete' | 'invalid_type' | 'empty';
  output_complete: boolean;
  confidence?: number;
  confidence_warning?: boolean; // true if confidence < 0.7
  missing_fields?: string[]; // Track what's missing
  grounded_rate?: number;
  latency_ms: number;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  [key: string]: any; // For extra tags
}

/**
 * Main withSpan wrapper - the contract for all agents
 * Now with automatic validator selection and config integration
 */
export function withSpan<O>(
  name: AgentName | string,
  fn: (...args: any[]) => Promise<O>,
  options?: {
    validator?: (output: O, config: ObservabilityConfig) => ValidateResult;
    validateInput?: boolean;
    strategyProfile?: any;
  }
): (...args: any[]) => Promise<O> {
  
  return async function wrappedAgent(...args: any[]): Promise<O> {
    const tracer = trace.getTracer('agents');
    const span = tracer.startSpan(`agent.${name}`, {
      kind: SpanKind.INTERNAL
    });
    
    console.log(`[TRACE] Created span for agent.${name}`);

    // Get configuration with strategy overrides
    const config = resolveThresholds(options?.strategyProfile);
    
    // Extract or generate strategy_id
    const strategyId = extractStrategyId(args[0]) || `STRAT_${Date.now()}`;
    
    // Auto-select validator if not provided
    const validator = options?.validator || 
      (name in AgentValidators ? AgentValidators[name as AgentName] : undefined);
    
    // Check for unknown agent without validator
    if (!validator && !(name in AgentValidators)) {
      span.setAttribute('error_code', ErrorCode.UNKNOWN_AGENT);
      span.setAttribute('agent_name', name);
      span.addEvent('unknown_agent', {
        agent: name,
        strategy_id: strategyId,
        error_code: ErrorCode.UNKNOWN_AGENT
      });
      console.warn(`[withSpan] Unknown agent '${name}' without validator`);
    }
    
    // Validate input if requested
    if (options?.validateInput && name in HandoffSchemas) {
      const handoffValidation = validateHandoff(
        HandoffSchemas[name as keyof typeof HandoffSchemas],
        args[0],
        'upstream',
        name
      );
      
      if (!handoffValidation.valid) {
        span.setAttribute('handoff_invalid', true);
        span.setAttribute('handoff_missing', handoffValidation.missing?.join(',') || '');
        if (process.env.LOG_AGENT_HANDOFFS === 'true') {
          console.warn(`[Handoff] Invalid input to ${name}:`, handoffValidation.missing);
        }
      }
    }
    
    // Initialize tracking
    const startTime = Date.now();
    let handoffStatus: AgentHopLog['handoff_status'];
    let groundedRate: number | undefined;
    let confidence: number = 1.0; // Default high confidence
    let tokensIn: number | undefined;
    let tokensOut: number | undefined;
    let costUsd: number | undefined;
    let statusOverride: ValidateResult['statusOverride'];
    const extraTags: Record<string, any> = {};

    // Create span context
    const ctx: SpanContext = {
      addTag: (key, value) => {
        if (value !== undefined && value !== null) {
          extraTags[key] = value;
          span.setAttribute(key, value);
        }
      },
      setHandoffStatus: (status) => {
        handoffStatus = status;
        span.setAttribute('handoff_status', status);
      },
      setGroundedRate: (rate) => {
        groundedRate = rate;
        span.setAttribute('grounded_rate', rate);
      },
      statusOverride: (status) => {
        statusOverride = status;
        span.setAttribute('status_override', status || '');
      },
      setConfidence: (conf) => {
        confidence = conf;
        span.setAttribute('confidence', conf);
        if (conf < config.LOW_CONFIDENCE_THRESHOLD) {
          span.setAttribute('confidence_warning', true);
        }
      },
      recordTokenUsage: (ti, to, cost) => {
        tokensIn = ti;
        tokensOut = to;
        costUsd = cost;
        span.setAttributes({
          'tokens_in': ti,
          'tokens_out': to,
          'cost_usd': cost || 0
        });
      }
    };

    // Set initial attributes including config
    // Use OpenInference semantic conventions for Phoenix
    span.setAttributes({
      'strategy_id': strategyId,
      'agent': name,
      'openinference.span.kind': 'AGENT',
      'input.value': JSON.stringify(args[0]),  // Phoenix needs this for UI
      'input_summary': summarizeInput(args[0]),
      ...config.toSpanTags() // Add all config thresholds
    });

    try {
      // Add context to args if function expects it
      const output = await fn(...args, ctx);
      
      // Validate output if validator available - PASS CONFIG!
      const validation = validator ? validator(output, config) : {
        complete: !validator ? false : true, // Mark incomplete if no validator
        confidence: !validator ? 0.5 : 1.0,
        statusOverride: !validator ? 'tool_error' as const : undefined,
        missing_fields: !validator ? ['validator'] : undefined,
        extraTags: !validator ? { error_code: ErrorCode.MISSING_VALIDATOR } : undefined
      };
      
      // Calculate confidence if not provided
      if (validation.confidence !== undefined) {
        confidence = validation.confidence;
        ctx.setConfidence(confidence);
      } else {
        // Auto-calculate confidence based on completeness and grounding
        confidence = calculateConfidence(validation.complete, groundedRate, statusOverride);
        ctx.setConfidence(confidence);
      }
      
      // Determine final status with clear precedence
      const status = validation.statusOverride || statusOverride || (validation.complete ? 'ok' : 'missing_fields');
      
      // Apply extra tags including error codes
      if (validation.extraTags) {
        Object.entries(validation.extraTags).forEach(([k, v]) => {
          if (v !== undefined && v !== null) {
            ctx.addTag(k, v);
          }
        });
      }
      
      // Add missing fields to tags if present
      if (validation.missing_fields && validation.missing_fields.length > 0) {
        ctx.addTag('missing_fields', validation.missing_fields.join(','));
      }
      
      // Extract and add error codes
      const errorCodes: string[] = [];
      if (validation.extraTags?.error_code) {
        errorCodes.push(validation.extraTags.error_code);
      }
      if (validation.extraTags?.error_codes) {
        errorCodes.push(...validation.extraTags.error_codes.split(','));
      }
      if (errorCodes.length > 0) {
        ctx.addTag('error_codes', [...new Set(errorCodes)].join(','));
      }
      
      // Set final span attributes
      const latencyMs = Date.now() - startTime;
      span.setAttributes({
        'status': status,
        'output_complete': validation.complete,
        'output.value': JSON.stringify(output),  // Phoenix needs this for UI
        'latency_ms': latencyMs
      });
      
      // Emit span event for non-OK status (for Phoenix filtering)
      if (status !== 'ok') {
        span.addEvent('validation_failure', {
          agent: name,
          strategy_id: strategyId,
          status,
          missing_fields: validation.missing_fields?.join(',') || '',
          error_codes: errorCodes.join(',') || '',
          confidence
        });
      }
      
      span.setStatus({ code: SpanStatusCode.OK });
      
      // Write JSONL log with all fields
      const logEntry: AgentHopLog = {
        ts: new Date().toISOString(),
        strategy_id: strategyId,
        agent: name,
        status,
        handoff_status: handoffStatus,
        output_complete: validation.complete,
        confidence,
        confidence_warning: confidence < config.LOW_CONFIDENCE_THRESHOLD,
        missing_fields: validation.missing_fields,
        grounded_rate: groundedRate,
        latency_ms: latencyMs,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: costUsd,
        ...extraTags
      };
      
      fs.appendFileSync(
        path.join(logDir, 'agent_hops.jsonl'),
        JSON.stringify(logEntry) + '\n'
      );
      
      // Add confidence warning to output if low
      if (confidence < config.LOW_CONFIDENCE_THRESHOLD && output && typeof output === 'object') {
        (output as any).__confidence_warning = `Low confidence: ${(confidence * 100).toFixed(0)}% - Results may be incomplete or uncertain`;
      }
      
      return output;
      
    } catch (error) {
      // Handle errors
      const latencyMs = Date.now() - startTime;
      
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message
      });
      
      span.setAttributes({
        'status': 'tool_error',
        'error_message': (error as Error).message,
        'error_code': ErrorCode.TOOL_ERROR,
        'latency_ms': latencyMs
      });
      
      // Log error
      const errorLog: AgentHopLog = {
        ts: new Date().toISOString(),
        strategy_id: strategyId,
        agent: name,
        status: 'tool_error',
        output_complete: false,
        confidence: 0,
        confidence_warning: true,
        latency_ms: latencyMs,
        error: (error as Error).message,
        error_code: ErrorCode.TOOL_ERROR
      };
      
      fs.appendFileSync(
        path.join(logDir, 'agent_hops.jsonl'),
        JSON.stringify(errorLog) + '\n'
      );
      
      throw error;
      
    } finally {
      span.end();
    }
  };
}

/**
 * Calculate confidence score based on various factors
 */
function calculateConfidence(
  complete: boolean,
  groundedRate?: number,
  status?: string
): number {
  let confidence = 1.0;
  
  // Reduce confidence for incomplete outputs
  if (!complete) confidence *= 0.6;
  
  // Factor in grounding rate if available
  if (groundedRate !== undefined) {
    confidence *= (0.5 + 0.5 * groundedRate); // Scale from 0.5 to 1.0
  }
  
  // Reduce confidence for certain statuses
  switch (status) {
    case 'no_match':
      confidence *= 0.8; // Still confident, but no results
      break;
    case 'missing_fields':
      confidence *= 0.5;
      break;
    case 'calc_error':
      confidence *= 0.3;
      break;
    case 'tool_error':
      confidence = 0.1;
      break;
  }
  
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Extract strategy_id from various input formats
 */
function extractStrategyId(input: any): string | undefined {
  if (!input) return undefined;
  if (typeof input === 'string') return undefined;
  
  return input.strategyId || 
         input.strategy_id || 
         input.sessionId ||
         input.id;
}

/**
 * Create a brief summary of input (≤120 chars)
 */
function summarizeInput(input: any): string {
  if (!input) return 'null';
  if (typeof input === 'string') return input.substring(0, 120);
  
  const parts: string[] = [];
  
  if (input.capital) parts.push(`$${input.capital}`);
  if (input.locations?.length) parts.push(input.locations[0]);
  if (input.propertyTypes?.length) parts.push(input.propertyTypes[0]);
  if (input.maxPrice) parts.push(`max:$${input.maxPrice}`);
  
  const summary = parts.join(' | ');
  return summary.length > 120 ? summary.substring(0, 117) + '...' : summary;
}

// Re-export grounding calculations from validators for backward compatibility
export { calculateMarketGroundedRate, calculateFinancialGroundedRate } from './validators.js';
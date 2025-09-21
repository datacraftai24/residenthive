/**
 * LLM Tracer - Production-ready OpenAI tracing with OpenInference conventions
 * 
 * All AI agents use this to ensure consistent Phoenix tracing
 * Implements best practices for safety, accuracy, and observability
 */

import OpenAI from 'openai';
import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';
import { calculateOpenAICost } from './openinference-helpers.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface TracedLLMCall {
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  model?: string;
  responseFormat?: 'json_object' | 'text';
  maxTokens?: number;
  topP?: number;
}

export interface LLMCallResult {
  content: string;
  parsed?: any;
  tokensUsed: { prompt: number; completion: number; total: number };
  cost: { prompt: number; completion: number; total: number };
  responseId?: string;
  systemFingerprint?: string;
}

// Constants for safety
const MAX_ATTRIBUTE_LENGTH = 16_000; // 16KB limit for attributes
const TRUNCATION_SUFFIX = '…[truncated]';

/**
 * Truncate long strings to prevent oversized attributes
 */
function truncateAttribute(text: string, maxLength: number = MAX_ATTRIBUTE_LENGTH): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

/**
 * Optional: Redact sensitive information
 */
function redactSensitive(text: string): string {
  // Add PII redaction logic here if needed
  // For now, just truncate
  return truncateAttribute(text);
}

/**
 * Make an LLM call with full OpenInference tracing
 * Used by ALL AI agents for consistency
 */
export async function tracedLLMCall({
  agentName,
  systemPrompt,
  userPrompt,
  temperature = 0.7,
  model = 'gpt-4o',
  responseFormat = 'json_object',
  maxTokens,
  topP
}: TracedLLMCall): Promise<LLMCallResult> {
  
  // LOG PROMPTS IF ENABLED
  if (process.env.LOG_LLM_PROMPTS === 'true') {
    console.log('\n' + '='.repeat(80));
    console.log(`LLM PROMPT [${agentName}]`);
    console.log('='.repeat(80));
    console.log('\nSYSTEM PROMPT:');
    console.log(systemPrompt);
    console.log('\nUSER PROMPT:');
    console.log(userPrompt);
    console.log('\nPARAMETERS:');
    console.log(`- Model: ${model}`);
    console.log(`- Temperature: ${temperature}`);
    console.log(`- Response Format: ${responseFormat}`);
    console.log('-'.repeat(80));
  }
  
  // Always create a dedicated child span for this LLM call
  const tracer = trace.getTracer('ai-agents');
  const span = tracer.startSpan(
    `${agentName}.analyze`,
    {
      attributes: {
        'ai.agent.name': agentName,
        'ai.operation': 'analyze',
        'openinference.span.kind': 'LLM'
      }
    },
    context.active() // parent = current span if any
  );

  // Set OpenInference attributes BEFORE the call
  // Model info
  span.setAttribute('llm.model_name', model);
  span.setAttribute('llm.system', 'openai');
  span.setAttribute('llm.provider', 'openai');
  
  // Build invocation parameters
  const invocationParams: Record<string, any> = { temperature };
  if (responseFormat === 'json_object') invocationParams.response_format = 'json_object';
  if (maxTokens !== undefined) invocationParams.max_tokens = maxTokens;
  if (topP !== undefined) invocationParams.top_p = topP;
  
  span.setAttribute('llm.invocation_parameters', JSON.stringify(invocationParams));
  
  // Input messages (flattened for Phoenix with correct namespace)
  span.setAttribute('input.messages.0.message.role', 'system');
  span.setAttribute('input.messages.0.message.content', redactSensitive(systemPrompt));
  span.setAttribute('input.messages.1.message.role', 'user');
  span.setAttribute('input.messages.1.message.content', redactSensitive(userPrompt));
  span.setAttribute('input.messages.count', 2);
  
  // Agent identifier
  span.setAttribute('ai.agent.name', agentName);
  span.setAttribute('openinference.span.kind', 'LLM');
  
  try {
    // Execute within span context
    return await context.with(trace.setSpan(context.active(), span), async () => {
      
      // Build request
      const messages: any = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      
      const requestOptions: any = { 
        model, 
        messages, 
        temperature 
      };
      
      if (responseFormat === 'json_object') {
        requestOptions.response_format = { type: 'json_object' };
      }
      if (maxTokens !== undefined) {
        requestOptions.max_tokens = maxTokens;
      }
      if (topP !== undefined) {
        requestOptions.top_p = topP;
      }
      
      // Make the API call
      const response = await openai.chat.completions.create(requestOptions);
      
      const content = response.choices[0].message.content || '';
      
      // LOG RESPONSE IF ENABLED
      if (process.env.LOG_LLM_PROMPTS === 'true') {
        console.log('\nLLM RESPONSE:');
        console.log(content.substring(0, 500) + (content.length > 500 ? '...[truncated]' : ''));
        console.log('='.repeat(80) + '\n');
      }
      
      // Use authoritative token counts from API
      const usage = response.usage || { 
        prompt_tokens: 0, 
        completion_tokens: 0, 
        total_tokens: 0 
      };
      
      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      const totalTokens = usage.total_tokens || (promptTokens + completionTokens);
      
      // Fall back to estimation only if API didn't provide usage
      const estimatedPromptTokens = promptTokens || Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const estimatedCompletionTokens = completionTokens || Math.ceil(content.length / 4);
      const finalPromptTokens = promptTokens || estimatedPromptTokens;
      const finalCompletionTokens = completionTokens || estimatedCompletionTokens;
      const finalTotalTokens = totalTokens || (finalPromptTokens + finalCompletionTokens);
      
      // Calculate costs
      const cost = calculateOpenAICost(model, finalPromptTokens, finalCompletionTokens);
      
      // Set OpenInference output attributes
      // Output (truncated for safety)
      span.setAttribute('output.value', redactSensitive(content));
      
      // Token counts (integers)
      span.setAttribute('llm.token_count.prompt', finalPromptTokens);
      span.setAttribute('llm.token_count.completion', finalCompletionTokens);
      span.setAttribute('llm.token_count.total', finalTotalTokens);
      
      // Costs (floats in USD)
      span.setAttribute('llm.cost.prompt', cost.prompt);
      span.setAttribute('llm.cost.completion', cost.completion);
      span.setAttribute('llm.cost.total', cost.total);
      
      // Response metadata for correlation
      if (response.id) {
        span.setAttribute('llm.response_id', response.id);
      }
      if (response.created) {
        span.setAttribute('llm.created', response.created);
      }
      if (response.system_fingerprint) {
        span.setAttribute('llm.system_fingerprint', response.system_fingerprint);
      }
      
      // Model used (in case of fallback)
      if (response.model) {
        span.setAttribute('llm.model_used', response.model);
      }
      
      // Success indicator
      span.setAttribute('llm.success', true);
      span.setStatus({ code: SpanStatusCode.OK });
      
      // Parse JSON if needed
      let parsed = undefined;
      if (responseFormat === 'json_object') {
        try {
          parsed = JSON.parse(content);
        } catch (e) {
          console.error(`[LLM Tracer] Failed to parse JSON response from ${agentName}:`, e);
          span.setAttribute('llm.parse_error', true);
          span.addEvent('json_parse_failed', {
            'error.message': e instanceof Error ? e.message : 'Unknown error'
          });
        }
      }
      
      return {
        content,
        parsed,
        tokensUsed: {
          prompt: finalPromptTokens,
          completion: finalCompletionTokens,
          total: finalTotalTokens
        },
        cost,
        responseId: response.id,
        systemFingerprint: response.system_fingerprint
      };
    });
    
  } catch (error: any) {
    // Proper error handling with OpenTelemetry conventions
    if (error instanceof Error) {
      // Record exception the OTel way
      span.recordException(error);
      span.setStatus({ 
        code: SpanStatusCode.ERROR, 
        message: error.message 
      });
      
      // Additional error attributes
      span.setAttribute('error', true);
      span.setAttribute('llm.success', false);
      span.setAttribute('error.type', error.name);
      
      // OpenAI specific error details
      if (error.message.includes('rate_limit')) {
        span.setAttribute('error.category', 'rate_limit');
      } else if (error.message.includes('timeout')) {
        span.setAttribute('error.category', 'timeout');
      } else if (error.message.includes('api_key')) {
        span.setAttribute('error.category', 'authentication');
      }
    } else {
      // Non-Error thrown
      span.setStatus({ 
        code: SpanStatusCode.ERROR, 
        message: 'Unknown error' 
      });
      span.setAttribute('error', true);
      span.setAttribute('llm.success', false);
    }
    
    throw error;
    
  } finally {
    // Always end the child span we created
    span.end();
  }
}

/**
 * Helper to create a child span for LLM operations
 * Use this when you want explicit control over span lifecycle
 */
export function createLLMSpan(
  agentName: string,
  operation: string = 'analyze'
): Span {
  const tracer = trace.getTracer('ai-agents');
  const span = tracer.startSpan(`${agentName}.${operation}`, {
    attributes: {
      'ai.agent.name': agentName,
      'ai.operation': operation,
      'openinference.span.kind': 'LLM'
    }
  });
  
  return span;
}

/**
 * Wrap a function to run within an LLM span context
 */
export async function withLLMSpan<T>(
  agentName: string,
  operation: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const span = createLLMSpan(agentName, operation);
  
  try {
    return await context.with(trace.setSpan(context.active(), span), async () => {
      return await fn(span);
    });
  } catch (error) {
    if (error instanceof Error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    }
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Add prompt template metadata (optional)
 * Call this on your span if using templates
 */
export function addPromptTemplateMetadata(
  span: Span,
  templateName: string,
  variables: Record<string, any>
): void {
  span.setAttribute('llm.prompt_template.name', templateName);
  span.setAttribute('llm.prompt_template.variables', JSON.stringify(variables));
}
/**
 * OpenInference Semantic Convention Helpers
 * 
 * Properly formats LLM tracing for Phoenix using OpenInference standards
 * Reference: https://github.com/Arize-ai/openinference/blob/main/spec/semantic_conventions.md
 */

import { Span } from '@opentelemetry/api';

export interface LLMRequest {
  model: string;
  provider: 'openai' | 'anthropic' | 'cohere';
  messages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  prompt?: string; // For non-chat completions
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface LLMResponse {
  content: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Set LLM attributes on span using OpenInference semantic conventions
 */
export function setLLMAttributes(
  span: Span,
  request: LLMRequest,
  response: LLMResponse
): void {
  // Model information
  span.setAttribute('llm.model_name', request.model);
  span.setAttribute('llm.system', request.provider);
  span.setAttribute('llm.provider', request.provider);
  
  // Invocation parameters
  const params: Record<string, any> = {};
  if (request.temperature !== undefined) params.temperature = request.temperature;
  if (request.maxTokens !== undefined) params.max_tokens = request.maxTokens;
  if (request.topP !== undefined) params.top_p = request.topP;
  
  span.setAttribute('llm.invocation_parameters', JSON.stringify(params));
  
  // Input (prompt or messages)
  if (request.messages && request.messages.length > 0) {
    // For chat models, flatten messages
    request.messages.forEach((msg, idx) => {
      span.setAttribute(`input.messages.${idx}.role`, msg.role);
      span.setAttribute(`input.messages.${idx}.content`, msg.content);
    });
    span.setAttribute('input.messages.count', request.messages.length);
  } else if (request.prompt) {
    // For completion models
    span.setAttribute('input.value', request.prompt);
  }
  
  // Output
  span.setAttribute('output.value', response.content);
  
  // Token usage (must be integers)
  span.setAttribute('llm.token_count.prompt', response.tokensUsed.prompt);
  span.setAttribute('llm.token_count.completion', response.tokensUsed.completion);
  span.setAttribute('llm.token_count.total', response.tokensUsed.total);
  
  // Cost (must be floats in USD)
  if (response.cost) {
    span.setAttribute('llm.cost.prompt', response.cost.prompt);
    span.setAttribute('llm.cost.completion', response.cost.completion);
    span.setAttribute('llm.cost.total', response.cost.total);
  }
  
  // Optional: Add semantic tags
  span.setAttribute('openinference.span.kind', 'LLM');
}

/**
 * Calculate OpenAI costs
 */
export function calculateOpenAICost(
  model: string,
  promptTokens: number,
  completionTokens: number
): { prompt: number; completion: number; total: number } {
  // OpenAI pricing per 1K tokens (as of 2024)
  const pricing: Record<string, { prompt: number; completion: number }> = {
    'gpt-4o': { prompt: 0.01, completion: 0.03 },
    'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
    'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
    'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 }
  };
  
  const modelPricing = pricing[model] || pricing['gpt-4o'];
  
  const promptCost = (promptTokens / 1000) * modelPricing.prompt;
  const completionCost = (completionTokens / 1000) * modelPricing.completion;
  
  return {
    prompt: promptCost,
    completion: completionCost,
    total: promptCost + completionCost
  };
}

/**
 * Set error attributes using OpenInference conventions
 */
export function setErrorAttributes(span: Span, error: Error): void {
  span.setAttribute('exception.type', error.name);
  span.setAttribute('exception.message', error.message);
  if (error.stack) {
    span.setAttribute('exception.stacktrace', error.stack);
  }
  span.setAttribute('error', true);
}

/**
 * Helper to get current span from context
 */
export function getCurrentSpan(ctx: any): Span | undefined {
  // This depends on your SpanContext implementation
  // Typically you'd get it from OpenTelemetry context
  return ctx._span || ctx.span;
}
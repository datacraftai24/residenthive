/**
 * Agent Logger Service
 * Comprehensive logging system for multi-agent interactions
 * Designed for Phoenix/Arize integration and performance evaluation
 */

import { db } from '../db';
import { 
  agentAnalysisSessions, 
  agentExecutionLogs, 
  propertyDataFlow,
  agentPerformanceMetrics,
  promptPerformanceTracking,
  type InsertAgentAnalysisSession,
  type InsertAgentExecutionLog,
  type InsertPropertyDataFlow
} from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface AgentExecutionContext {
  sessionId: string;
  agentName: string;
  agentRole: string;
  executionOrder: number;
  startTime: number;
}

export interface AgentLogData {
  inputData: any;
  outputData?: any;
  prompt?: string;
  aiResponse?: string;
  tokensUsed?: number;
  errorMessage?: string;
  success?: boolean;
  dataTransformations?: any;
}

export interface PropertyTransformation {
  propertyId: string;
  agentName: string;
  inputPropertyData: any;
  outputPropertyData?: any;
  addressFields?: any;
  dataQuality?: any;
  fieldsAdded?: any;
  fieldsModified?: any;
  fieldsRemoved?: any;
}

class AgentLoggerService {
  /**
   * Start a new multi-agent analysis session
   */
  async startSession(sessionData: {
    strategyId: string;
    agentId?: number;
    profileId?: number;
    searchCriteria: any;
    investmentProfile: any;
    sessionType?: string;
  }): Promise<string> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const sessionRecord: InsertAgentAnalysisSession = {
      id: sessionId,
      strategyId: sessionData.strategyId,
      agentId: sessionData.agentId || null,
      profileId: sessionData.profileId || null,
      searchCriteria: sessionData.searchCriteria,
      investmentProfile: sessionData.investmentProfile,
      sessionType: sessionData.sessionType || 'multi_agent',
      totalAgentsUsed: 0,
      totalPropertiesAnalyzed: 0,
      sessionStatus: 'running',
      createdAt: new Date().toISOString()
    };

    try {
      await db.insert(agentAnalysisSessions).values(sessionRecord);
      console.log(`📊 [Agent Logger] Started session: ${sessionId}`);
      return sessionId;
    } catch (error) {
      console.error('❌ [Agent Logger] Failed to start session:', error);
      throw error;
    }
  }

  /**
   * Log individual agent execution
   */
  async logAgentExecution(
    context: AgentExecutionContext, 
    logData: AgentLogData
  ): Promise<string> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const executionTime = Date.now() - context.startTime;

    const executionRecord: InsertAgentExecutionLog = {
      id: executionId,
      sessionId: context.sessionId,
      agentName: context.agentName,
      agentRole: context.agentRole,
      executionOrder: context.executionOrder,
      inputData: logData.inputData,
      outputData: logData.outputData,
      prompt: logData.prompt,
      aiResponse: logData.aiResponse,
      executionTime,
      tokensUsed: logData.tokensUsed,
      errorMessage: logData.errorMessage,
      success: logData.success ?? true,
      dataTransformations: logData.dataTransformations,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };

    try {
      await db.insert(agentExecutionLogs).values(executionRecord);
      console.log(`📝 [Agent Logger] Logged ${context.agentName} execution: ${executionTime}ms`);
      return executionId;
    } catch (error) {
      console.error('❌ [Agent Logger] Failed to log execution:', error);
      throw error;
    }
  }

  /**
   * Log property data transformations for address debugging
   */
  async logPropertyTransformation(
    sessionId: string,
    executionLogId: string,
    transformation: PropertyTransformation
  ): Promise<void> {
    const flowId = `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const flowRecord: InsertPropertyDataFlow = {
      id: flowId,
      sessionId,
      executionLogId,
      propertyId: transformation.propertyId,
      agentName: transformation.agentName,
      inputPropertyData: transformation.inputPropertyData,
      outputPropertyData: transformation.outputPropertyData,
      addressFields: transformation.addressFields,
      dataQuality: transformation.dataQuality,
      fieldsAdded: transformation.fieldsAdded,
      fieldsModified: transformation.fieldsModified,
      fieldsRemoved: transformation.fieldsRemoved,
      createdAt: new Date().toISOString()
    };

    try {
      await db.insert(propertyDataFlow).values(flowRecord);
      console.log(`🏠 [Agent Logger] Logged property transformation: ${transformation.propertyId}`);
    } catch (error) {
      console.error('❌ [Agent Logger] Failed to log property transformation:', error);
    }
  }

  /**
   * Complete a session with final metrics
   */
  async completeSession(
    sessionId: string, 
    completionData: {
      totalAgentsUsed: number;
      totalPropertiesAnalyzed: number;
      finalReportPath?: string;
      sessionStatus: 'completed' | 'failed' | 'cancelled';
      errorLogs?: any;
    }
  ): Promise<void> {
    try {
      await db
        .update(agentAnalysisSessions)
        .set({
          totalAgentsUsed: completionData.totalAgentsUsed,
          totalPropertiesAnalyzed: completionData.totalPropertiesAnalyzed,
          finalReportPath: completionData.finalReportPath,
          sessionStatus: completionData.sessionStatus,
          errorLogs: completionData.errorLogs,
          completedAt: new Date().toISOString()
        })
        .where(eq(agentAnalysisSessions.id, sessionId));

      console.log(`✅ [Agent Logger] Session completed: ${sessionId}`);
    } catch (error) {
      console.error('❌ [Agent Logger] Failed to complete session:', error);
    }
  }

  /**
   * Create execution context for agent logging
   */
  createExecutionContext(
    sessionId: string,
    agentName: string,
    agentRole: string,
    executionOrder: number
  ): AgentExecutionContext {
    return {
      sessionId,
      agentName,
      agentRole,
      executionOrder,
      startTime: Date.now()
    };
  }

  /**
   * Helper to extract address fields for tracking
   */
  extractAddressFields(propertyData: any): any {
    return {
      address: propertyData?.address || null,
      fullAddress: propertyData?.fullAddress || null,
      city: propertyData?.city || null,
      state: propertyData?.state || null,
      postalCode: propertyData?.postalCode || null,
      zip_code: propertyData?.zip_code || null,
      completeness: this.calculateAddressCompleteness(propertyData)
    };
  }

  /**
   * Calculate address data completeness score
   */
  private calculateAddressCompleteness(propertyData: any): number {
    const fields = ['address', 'city', 'state', 'postalCode', 'zip_code'];
    const present = fields.filter(field => 
      propertyData?.[field] && 
      propertyData[field] !== '' && 
      propertyData[field] !== null
    ).length;
    
    return Math.round((present / fields.length) * 100);
  }

  /**
   * Log prompt performance for optimization
   */
  async logPromptPerformance(data: {
    agentName: string;
    promptVersion: string;
    promptTemplate: string;
    inputContext?: any;
    outputQuality?: number;
    executionTime?: number;
    tokensUsed?: number;
    successRate?: number;
    testGroup?: string;
  }): Promise<void> {
    const promptId = `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      await db.insert(promptPerformanceTracking).values({
        id: promptId,
        agentName: data.agentName,
        promptVersion: data.promptVersion,
        promptTemplate: data.promptTemplate,
        inputContext: data.inputContext,
        outputQuality: data.outputQuality?.toString(),
        executionTime: data.executionTime,
        tokensUsed: data.tokensUsed,
        successRate: data.successRate?.toString(),
        testGroup: data.testGroup,
        createdAt: new Date().toISOString()
      });

      console.log(`📈 [Agent Logger] Logged prompt performance: ${data.agentName} v${data.promptVersion}`);
    } catch (error) {
      console.error('❌ [Agent Logger] Failed to log prompt performance:', error);
    }
  }

  /**
   * Get session metrics for Phoenix integration
   */
  async getSessionMetrics(sessionId: string): Promise<any> {
    try {
      const session = await db
        .select()
        .from(agentAnalysisSessions)
        .where(eq(agentAnalysisSessions.id, sessionId))
        .limit(1);

      const executions = await db
        .select()
        .from(agentExecutionLogs)
        .where(eq(agentExecutionLogs.sessionId, sessionId));

      const propertyFlows = await db
        .select()
        .from(propertyDataFlow)
        .where(eq(propertyDataFlow.sessionId, sessionId));

      return {
        session: session[0] || null,
        executions,
        propertyFlows,
        totalExecutionTime: executions.reduce((sum, exec) => sum + (exec.executionTime || 0), 0),
        averageExecutionTime: executions.length > 0 
          ? executions.reduce((sum, exec) => sum + (exec.executionTime || 0), 0) / executions.length 
          : 0,
        successRate: executions.length > 0
          ? executions.filter(exec => exec.success).length / executions.length
          : 0
      };
    } catch (error) {
      console.error('❌ [Agent Logger] Failed to get session metrics:', error);
      return null;
    }
  }
}

export const agentLogger = new AgentLoggerService();
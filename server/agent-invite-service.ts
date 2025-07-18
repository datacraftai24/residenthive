import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { db } from './db.js';
import { agents, type InsertAgent } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';

interface AgentConfig {
  email: string;
  firstName: string;
  lastName: string;
  brokerageName: string;
}

interface AgentsYaml {
  agents: AgentConfig[];
}

/**
 * Reads the agents.yaml file and returns parsed agent configurations
 */
export function readAgentsConfig(): AgentConfig[] {
  try {
    const yamlContent = readFileSync('./config/agents.yaml', 'utf8');
    const config: AgentsYaml = parse(yamlContent);
    return config.agents || [];
  } catch (error) {
    console.error('Failed to read agents.yaml:', error);
    return [];
  }
}

/**
 * Generates a secure invite token
 */
function generateInviteToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Checks if an agent already exists in the database
 */
export async function agentExists(email: string): Promise<boolean> {
  const existingAgent = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.email, email))
    .limit(1);
  
  return existingAgent.length > 0;
}

/**
 * Creates a new agent record with invite token
 * SECURITY: Returns both token and agent data for validation
 */
export async function createAgentWithInvite(agentConfig: AgentConfig): Promise<{
  inviteToken: string;
  agentData: AgentConfig;
}> {
  const inviteToken = generateInviteToken();
  const now = new Date().toISOString();
  
  const newAgent: InsertAgent = {
    email: agentConfig.email,
    firstName: agentConfig.firstName,
    lastName: agentConfig.lastName,
    brokerageName: agentConfig.brokerageName,
    inviteToken,
    isActivated: false,
    passwordHash: null,
    createdAt: now,
  };

  await db.insert(agents).values(newAgent);
  
  console.log(`✅ Created agent invite for ${agentConfig.firstName} ${agentConfig.lastName} (${agentConfig.email})`);
  
  // Return both token and agent data for secure validation
  return {
    inviteToken,
    agentData: agentConfig
  };
}

/**
 * Sends an invite email to the agent using the email service
 */
export async function sendInviteEmail(agentConfig: AgentConfig, inviteToken: string): Promise<void> {
  console.log(`📧 Sending invite email to ${agentConfig.email} with token ${inviteToken.substring(0, 8)}...`);
  
  const { emailService } = await import('./email-service.js');
  await emailService.sendAgentInvite(agentConfig, inviteToken);
}

/**
 * Processes all agents from YAML config
 * Creates invites for new agents and skips existing ones
 */
export async function processAgentInvites(): Promise<{
  processed: number;
  created: number;
  skipped: number;
}> {
  console.log('🔄 Processing agent invites from agents.yaml...');
  
  const agentConfigs = readAgentsConfig();
  let processed = 0;
  let created = 0;
  let skipped = 0;

  for (const agentConfig of agentConfigs) {
    processed++;
    
    // Check if agent already exists
    if (await agentExists(agentConfig.email)) {
      console.log(`⏭️  Skipping ${agentConfig.email} - already exists`);
      skipped++;
      continue;
    }

    try {
      // Create agent and generate invite
      const { inviteToken, agentData } = await createAgentWithInvite(agentConfig);
      
      // Send invite email with secure validation
      await sendInviteEmail(agentData, inviteToken);
      
      created++;
    } catch (error) {
      console.error(`❌ Failed to process ${agentConfig.email}:`, error);
    }
  }

  console.log(`✅ Agent invite processing complete:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped}`);

  return { processed, created, skipped };
}

/**
 * Manual invite function for individual agents
 * Can be called directly or via API endpoint
 */
export async function inviteAgent(agentData: {
  email: string;
  firstName: string;
  lastName: string;
  brokerageName: string;
}): Promise<{ success: boolean; inviteToken?: string; message: string }> {
  try {
    // Check if agent already exists
    if (await agentExists(agentData.email)) {
      return {
        success: false,
        message: 'Agent with this email already exists'
      };
    }

    // Create agent and generate invite
    const { inviteToken, agentData: createdAgent } = await createAgentWithInvite(agentData);
    
    // Send invite email with secure validation
    await sendInviteEmail(createdAgent, inviteToken);

    return {
      success: true,
      inviteToken,
      message: 'Agent invite created successfully'
    };
  } catch (error) {
    console.error('Failed to invite agent:', error);
    return {
      success: false,
      message: 'Failed to create agent invite'
    };
  }
}
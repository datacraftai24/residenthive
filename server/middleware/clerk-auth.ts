import { requireAuth } from '@clerk/express';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { Request, Response, NextFunction } from 'express';
import { db } from '../db.js';
import { agents } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

// Extend Express Request type to include auth
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
        orgId?: string;
      };
      agent?: {
        id: number;
        email: string;
        firstName: string;
        lastName: string;
        brokerageName: string;
        clerkUserId: string;
        createdAt: string;
      };
    }
  }
}

// Middleware to verify JWT and attach userId
export const clerkAuth = requireAuth();

// Helper to get/create agent from Clerk user
export const getAgentFromClerk = async (req: Request): Promise<any> => {
  const userId = req.auth?.userId;
  if (!userId) return null;

  try {
    // Look up agent by Clerk userId
    const existingAgents = await db.select().from(agents)
      .where(eq(agents.clerkUserId, userId))
      .limit(1);

    if (existingAgents.length > 0) {
      return existingAgents[0];
    }

    // Get user from Clerk and auto-create agent record
    const user = await clerkClient.users.getUser(userId);

    // Create new agent record
    const [newAgent] = await db.insert(agents).values({
      clerkUserId: userId,
      email: user.emailAddresses[0].emailAddress,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      brokerageName: (user.publicMetadata?.brokerageName as string) || 'Independent',
      createdAt: new Date().toISOString(),
      // Set these to satisfy the schema requirements
      isActivated: true,
      inviteToken: null,
      passwordHash: null
    }).returning();

    return newAgent;
  } catch (error) {
    console.error('Error getting/creating agent:', error);
    return null;
  }
};

// Middleware that verifies auth and attaches agent data
export const withAgent = async (req: Request, res: Response, next: NextFunction) => {
  // First verify Clerk auth
  clerkAuth(req, res, async (err) => {
    if (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Then get/create agent
    const agent = await getAgentFromClerk(req);
    if (!agent) {
      return res.status(403).json({ error: 'Agent not found' });
    }

    // Attach agent to request
    req.agent = agent;
    next();
  });
};
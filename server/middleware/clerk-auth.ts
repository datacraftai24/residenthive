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
    const existingAgents = await db.select().from(agents).where(eq(agents.clerkUserId, userId)).limit(1);
    if (existingAgents.length > 0) return existingAgents[0];

    // Get user from Clerk and auto-create or reconcile agent record
    const user = await clerkClient.users.getUser(userId);
    const primaryEmail = user.emailAddresses?.[0]?.emailAddress || '';

    // Try to reconcile by email: if an agent exists with the same email, update clerkUserId and return it
    if (primaryEmail) {
      try {
        const agentsByEmail = await db.select().from(agents).where(eq(agents.email, primaryEmail)).limit(1);
        if (agentsByEmail.length > 0) {
          const existing = agentsByEmail[0];
          try {
            await db.update(agents).set({ clerkUserId: userId }).where(eq(agents.id, existing.id));
          } catch (updErr) {
            // ignore update failure and return the existing record
          }
          const reconciled = await db.select().from(agents).where(eq(agents.clerkUserId, userId)).limit(1);
          if (reconciled.length > 0) return reconciled[0];
          return existing;
        }
      } catch (emailLookupErr) {
        // continue to try insert as fallback
      }
    }

    // Create new agent record; protect against race/unique constraint by catching duplicate key errors
    try {
      const [newAgent] = await db.insert(agents).values({
        clerkUserId: userId,
        email: primaryEmail || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        brokerageName: (user.publicMetadata?.brokerageName as string) || 'Independent',
        createdAt: new Date().toISOString(),
        isActivated: true,
        inviteToken: null,
        passwordHash: null
      }).returning();
      return newAgent;
    } catch (insertErr: any) {
      if (insertErr?.code === '23505') {
        try {
          if (primaryEmail) {
            const byEmail = await db.select().from(agents).where(eq(agents.email, primaryEmail)).limit(1);
            if (byEmail.length > 0) return byEmail[0];
          }
          const byClerk = await db.select().from(agents).where(eq(agents.clerkUserId, userId)).limit(1);
          if (byClerk.length > 0) return byClerk[0];
        } catch (requeryErr) {
          // ignore
        }
      }
      throw insertErr;
    }
  } catch (error) {
    return null;
  }
};

// Middleware that verifies auth and attaches agent data
export const withAgent = async (req: Request, res: Response, next: NextFunction) => {
  // First check for explicit agent header fallback (useful in dev/testing)
  try {
    const headerAgentId = req.headers['x-agent-id'] as string | undefined;
    const headerClerkUserId = req.headers['x-clerk-user-id'] as string | undefined;

    if (headerAgentId) {
      console.log('[ClerkAuth] Resolving agent from X-Agent-Id header:', headerAgentId);
      const parsed = parseInt(headerAgentId as string);
      if (!isNaN(parsed)) {
        const results = await db.select().from(agents).where(eq(agents.id, parsed)).limit(1);
        if (results.length > 0) {
              // Found agent by numeric id from header
          req.agent = results[0];
          return next();
        }
      }
    }

    if (headerClerkUserId) {
      console.log('[ClerkAuth] Resolving agent from X-Clerk-User-Id header:', headerClerkUserId);
      const results = await db.select().from(agents).where(eq(agents.clerkUserId, headerClerkUserId)).limit(1);
      if (results.length > 0) {
        // Found agent by clerkUserId from header
        req.agent = results[0];
        return next();
      }
    }
  } catch (headerErr) {
      // fall through to normal auth flow
  }

  // First verify Clerk auth
  clerkAuth(req, res, async (err) => {
    if (err) return res.status(401).json({ error: 'Unauthorized' });

    // Then get/create agent
    const agent = await getAgentFromClerk(req);
    if (!agent) return res.status(403).json({ error: 'Agent not found' });

    // Attach agent to request
    req.agent = agent;
    next();
  });
};
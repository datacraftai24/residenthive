import { requireAuth as clerkRequireAuth } from '@clerk/express';
import type { Request, Response, NextFunction } from 'express';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { db } from '../db.js';
import { agents } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

// Extend Express Request to include 'auth' property
declare global {
  namespace Express {
    interface Request {
      auth?: any;
    }
  }
}


// Custom requireAuth with debug logging
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  return clerkRequireAuth()(req, res, (err?: any) => {
    console.log('=====>', req);
    if (err) {
      console.error('[Clerk] requireAuth error:', err);
      return res.status(401).json({ error: 'Clerk authentication failed', details: err?.message || err });
    }
    console.log('[Clerk] requireAuth success, req.auth:', req.auth);
    next();
  });
}

// Helper to get/create agent from Clerk user
export const getAgentFromClerk = async (req: any) => {
  const { userId } = req.auth;
  if (!userId) return null;

  // Look up agent by Clerk userId
  const [agent] = await db.select().from(agents)
    .where(eq(agents.clerkUserId, userId))
    .limit(1);

  if (!agent) {
    // Get user from Clerk and auto-create agent record
    const user = await clerkClient.users.getUser(userId);
    const [newAgent] = await db.insert(agents).values({
      clerkUserId: userId,
      email: user.emailAddresses[0].emailAddress,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      brokerageName: user.publicMetadata?.brokerageName as string || 'Independent',
      createdAt: new Date().toISOString()
    }).returning();
    return newAgent;
  }

  return agent;
};

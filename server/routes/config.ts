/**
 * Configuration API Routes
 * 
 * Provides endpoints for reading and updating configuration values
 * with proper authentication and permissions
 */

import { Router, Request, Response } from 'express';
import { configRegistry, ConfigKey } from '../config/config-registry.js';
import { validateConfigValue } from '../config/config-schema.js';

const router = Router();

/**
 * Get a configuration value
 * GET /api/config/:key
 */
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const key = req.params.key as ConfigKey;
    const value = await configRegistry.getValue(key);
    
    res.json({
      success: true,
      key,
      value,
      stale: configRegistry.isStale(key, 86400) // 24 hours
    });
  } catch (error) {
    console.error('Failed to get config:', error);
    res.status(404).json({
      success: false,
      error: error instanceof Error ? error.message : 'Config not found'
    });
  }
});

/**
 * Get multiple configuration values
 * POST /api/config/batch
 * Body: { keys: string[] }
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { keys } = req.body;
    
    if (!Array.isArray(keys)) {
      return res.status(400).json({
        success: false,
        error: 'Keys must be an array'
      });
    }
    
    const values = await configRegistry.getValues(keys as ConfigKey[]);
    
    res.json({
      success: true,
      values
    });
  } catch (error) {
    console.error('Failed to get configs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve configuration values'
    });
  }
});

/**
 * Update a configuration value
 * PUT /api/config/:key
 * Body: { value: any, ttl?: number, provenance?: {...} }
 * 
 * TODO: Add authentication and permission checking
 */
router.put('/:key', async (req: Request, res: Response) => {
  try {
    const key = req.params.key as ConfigKey;
    const { value, ttl, provenance } = req.body;
    
    // TODO: Get updater from authenticated user
    const updater = req.headers['x-agent-name'] as string || 'admin';
    
    // Validate the value against schema
    const validation = validateConfigValue(key, value);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: `Invalid value: ${validation.error}`
      });
    }
    
    // Update the config
    await configRegistry.updateValue(key, value, updater, {
      ttl,
      provenance: provenance || { source: 'api' }
    });
    
    res.json({
      success: true,
      message: `Config ${key} updated successfully`
    });
  } catch (error) {
    console.error('Failed to update config:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update configuration'
    });
  }
});

/**
 * Get audit history for a configuration
 * GET /api/config/:key/audit
 */
router.get('/:key/audit', async (req: Request, res: Response) => {
  try {
    const key = req.params.key as ConfigKey;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const history = await configRegistry.getAuditHistory(key, limit);
    
    res.json({
      success: true,
      key,
      history
    });
  } catch (error) {
    console.error('Failed to get audit history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit history'
    });
  }
});

/**
 * Agent-specific config update endpoint
 * POST /api/config/agent-update
 * Body: { 
 *   agent: string,
 *   updates: Array<{ key: string, value: any, confidence: string, researchQuery?: string }>
 * }
 */
router.post('/agent-update', async (req: Request, res: Response) => {
  try {
    const { agent, updates } = req.body;
    
    if (!agent || !Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        error: 'Agent and updates array required'
      });
    }
    
    const results: any[] = [];
    
    for (const update of updates) {
      try {
        const { key, value, confidence, researchQuery } = update;
        
        // Validate before updating
        const validation = validateConfigValue(key as ConfigKey, value);
        if (!validation.success) {
          results.push({
            key,
            success: false,
            error: validation.error
          });
          continue;
        }
        
        // Update with agent provenance
        await configRegistry.updateValue(key as ConfigKey, value, agent, {
          ttl: getAgentConfigTTL(key, confidence),
          provenance: {
            source: 'agent',
            agent,
            researchQuery,
            confidence: confidence as 'HIGH' | 'MEDIUM' | 'LOW'
          }
        });
        
        results.push({
          key,
          success: true
        });
      } catch (error) {
        results.push({
          key: update.key,
          success: false,
          error: error instanceof Error ? error.message : 'Update failed'
        });
      }
    }
    
    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Agent config update failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process agent updates'
    });
  }
});

/**
 * WebSocket endpoint for real-time config updates
 * WS /api/config/subscribe
 * 
 * TODO: Implement WebSocket support for real-time updates
 */

/**
 * Helper function to determine TTL based on config type and confidence
 */
function getAgentConfigTTL(key: string, confidence: string): number | undefined {
  // Market data should expire quickly
  if (key.startsWith('market-data')) {
    switch (confidence) {
      case 'HIGH': return 7 * 24 * 3600; // 7 days
      case 'MEDIUM': return 3 * 24 * 3600; // 3 days
      case 'LOW': return 24 * 3600; // 1 day
      default: return 24 * 3600;
    }
  }
  
  // Source weights can be longer-lived
  if (key.startsWith('source-weights')) {
    return 30 * 24 * 3600; // 30 days
  }
  
  // Policy configs shouldn't expire from agents
  if (key.startsWith('policy')) {
    return undefined; // No expiry
  }
  
  // Default
  return 7 * 24 * 3600; // 7 days
}

export default router;
/**
 * Template Manager Service
 * 
 * Manages investment strategy templates stored as markdown files.
 * Allows agents to load, update, and learn from templates.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { withSpan, SpanContext } from '../observability/withSpan.js';

export interface StrategyTemplate {
  id: string;
  name: string;
  category: 'beginner' | 'intermediate' | 'advanced';
  metadata: {
    riskLevel: 'low' | 'medium' | 'high';
    experience: string;
    timeCommitment: string;
    timeToReturns?: string;  // 'immediate' | '6-9 months' | '12-24 months'
    occupancyRequired?: string; // 'owner-occupied' | 'none'
  };
  description: string;
  requirements: string[];
  implementation: string[];
  scoringWeights: Record<string, number>;
  bestMarkets: string[];
  risks: string[];
  lastUpdated?: Date;
  updatedBy?: string;
}

export class TemplateManager {
  private templatesPath: string;
  private cache: Map<string, StrategyTemplate> = new Map();
  
  constructor() {
    // Use absolute path to templates directory
    this.templatesPath = path.join(process.cwd(), 'server', 'data', 'templates');
  }
  
  /**
   * Initialize and load all templates
   */
  async initialize(): Promise<void> {
    console.log('📚 Initializing Template Manager...');
    
    // Ensure templates directory exists
    await fs.mkdir(this.templatesPath, { recursive: true });
    
    // Load all templates into cache
    await this.loadAllTemplates();
    
    console.log(`✅ Loaded ${this.cache.size} templates`);
  }
  
  /**
   * Load all templates from disk
   */
  private async loadAllTemplates(): Promise<void> {
    const categories = ['beginner', 'intermediate', 'advanced'];
    
    for (const category of categories) {
      const categoryPath = path.join(this.templatesPath, category);
      
      try {
        const files = await fs.readdir(categoryPath);
        
        for (const file of files) {
          if (file.endsWith('.md')) {
            const templateId = file.replace('.md', '');
            const fullPath = path.join(categoryPath, file);
            const content = await fs.readFile(fullPath, 'utf-8');
            const template = this.parseTemplateMarkdown(content, templateId, category as any);
            this.cache.set(templateId, template);
          }
        }
      } catch (error) {
        console.warn(`⚠️ No templates found in ${category} category`);
      }
    }
  }
  
  /**
   * Load a specific template
   */
  loadTemplate = withSpan(
    'load_template',
    async (templateId: string, ctx: SpanContext): Promise<StrategyTemplate | null> => {
      ctx.addTag('template_id', templateId);
      
      // Check cache first
      if (this.cache.has(templateId)) {
        ctx.addTag('cache_hit', true);
        return this.cache.get(templateId)!;
      }
      
      // Search for template file
      const categories = ['beginner', 'intermediate', 'advanced'];
      
      for (const category of categories) {
        const filePath = path.join(this.templatesPath, category, `${templateId}.md`);
        
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const template = this.parseTemplateMarkdown(content, templateId, category as any);
          
          // Cache for next time
          this.cache.set(templateId, template);
          
          ctx.addTag('loaded_from', 'disk');
          return template;
          
        } catch (error) {
          // File doesn't exist in this category, try next
          continue;
        }
      }
      
      console.error(`❌ Template not found: ${templateId}`);
      ctx.addTag('template_found', false);
      return null;
    }
  );
  
  /**
   * Parse markdown template into structured format
   */
  private parseTemplateMarkdown(
    content: string, 
    templateId: string, 
    category: 'beginner' | 'intermediate' | 'advanced'
  ): StrategyTemplate {
    
    const template: StrategyTemplate = {
      id: templateId,
      name: '',
      category,
      metadata: {
        riskLevel: 'medium',
        experience: '',
        timeCommitment: '',
        timeToReturns: '',
        occupancyRequired: ''
      },
      description: '',
      requirements: [],
      implementation: [],
      scoringWeights: {},
      bestMarkets: [],
      risks: []
    };
    
    const lines = content.split('\n');
    let currentSection = '';
    let descriptionLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Main title
      if (line.startsWith('# ')) {
        template.name = line.substring(2);
        continue;
      }
      
      // Section headers
      if (line.startsWith('## ')) {
        // Save description if we were collecting it
        if (currentSection === 'description' && descriptionLines.length > 0) {
          template.description = descriptionLines.join(' ').trim();
          descriptionLines = [];
        }
        
        currentSection = line.substring(3).toLowerCase();
        continue;
      }
      
      // Parse based on current section
      switch (currentSection) {
        case 'metadata':
          if (line.startsWith('- ')) {
            const [key, value] = line.substring(2).split(':').map(s => s.trim());
            if (key === 'riskLevel') {
              template.metadata[key] = value as any;
            } else if (key === 'experience' || key === 'timeCommitment' || key === 'timeToReturns' || key === 'occupancyRequired') {
              template.metadata[key] = value;
            }
            // Ignore old minCash/maxCash if still present
          }
          break;
          
        case 'description':
          if (line) {
            descriptionLines.push(line);
          }
          break;
          
        case 'requirements':
          if (line.startsWith('- ')) {
            template.requirements.push(line.substring(2));
          }
          break;
          
        case 'implementation steps':
        case 'implementation':
          if (line.match(/^\d+\./)) {
            template.implementation.push(line.replace(/^\d+\.\s*/, ''));
          }
          break;
          
        case 'scoring priorities':
        case 'scoring weights':
          if (line.startsWith('- ')) {
            const match = line.match(/- ([^:]+):\s*(\d+)%/);
            if (match) {
              const [_, factor, weight] = match;
              template.scoringWeights[this.normalizeKey(factor)] = parseInt(weight) / 100;
            }
          }
          break;
          
        case 'best markets':
          if (line.startsWith('- ')) {
            template.bestMarkets.push(line.substring(2));
          }
          break;
          
        case 'risks':
          if (line.startsWith('- ')) {
            template.risks.push(line.substring(2));
          }
          break;
      }
    }
    
    // Handle any remaining description
    if (currentSection === 'description' && descriptionLines.length > 0) {
      template.description = descriptionLines.join(' ').trim();
    }
    
    return template;
  }
  
  /**
   * Normalize key names for consistency
   */
  private normalizeKey(key: string): string {
    return key
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }
  
  /**
   * Get ALL templates - no budget filtering
   * Let LLM decide financial feasibility
   */
  getAllTemplates = withSpan(
    'get_all_templates',
    async (ctx: SpanContext): Promise<StrategyTemplate[]> => {
      const allTemplates = Array.from(this.cache.values());
      ctx.addTag('templates_count', allTemplates.length);
      console.log(`  📚 Returning ALL ${allTemplates.length} templates (no budget filtering)`);
      return allTemplates;
    }
  );
  
  /**
   * Select templates based on user goals, not budget
   * Let LLM handle financial feasibility
   */
  selectTemplatesForUser = withSpan(
    'select_templates_for_user',
    async (
      requirements: any,
      ctx: SpanContext
    ): Promise<{
      conservative: string;
      innovative: string;
      aggressive: string;
    }> => {
      
      // Get ALL templates, not filtered by budget
      const allTemplates = await this.getAllTemplates(ctx);
      
      // Group by characteristics that matter
      const immediate = allTemplates.filter(t => 
        t.metadata.timeToReturns === 'immediate' || 
        !t.metadata.timeToReturns
      );
      const delayed = allTemplates.filter(t => 
        t.metadata.timeToReturns && 
        t.metadata.timeToReturns !== 'immediate'
      );
      
      // Group by risk level
      const byRisk = {
        low: allTemplates.filter(t => t.metadata.riskLevel === 'low'),
        medium: allTemplates.filter(t => t.metadata.riskLevel === 'medium'),
        high: allTemplates.filter(t => t.metadata.riskLevel === 'high')
      };
      
      // Select based on user's timeline preference
      const wantsImmediate = requirements.goals?.timeline === 'immediate' || 
                           requirements.goals?.primaryGoal === 'cash-flow';
      
      const selected = {
        conservative: wantsImmediate 
          ? (immediate.find(t => t.metadata.riskLevel === 'low')?.id || 'traditional_rental')
          : (byRisk.low[0]?.id || 'traditional_rental'),
        innovative: byRisk.medium[0]?.id || 'small_multifamily',
        aggressive: wantsImmediate
          ? (immediate.find(t => t.metadata.riskLevel === 'high')?.id || 'large_multifamily')
          : (byRisk.high[0]?.id || 'development_opportunity')
      };
      
      ctx.addTag('selected_templates', Object.values(selected).join(','));
      ctx.addTag('wants_immediate', wantsImmediate);
      
      return selected;
    }
  );
  
  /**
   * Update template based on learning
   */
  async updateTemplate(
    templateId: string,
    updates: Partial<StrategyTemplate>,
    updatedBy: string = 'system'
  ): Promise<void> {
    
    const existing = await this.loadTemplate(templateId, {} as SpanContext);
    if (!existing) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    const updated = {
      ...existing,
      ...updates,
      lastUpdated: new Date(),
      updatedBy
    };
    
    // Update cache
    this.cache.set(templateId, updated);
    
    // Write back to file
    const markdown = this.generateMarkdown(updated);
    const filePath = path.join(this.templatesPath, existing.category, `${templateId}.md`);
    await fs.writeFile(filePath, markdown);
    
    console.log(`📝 Template ${templateId} updated by ${updatedBy}`);
  }
  
  /**
   * Generate markdown from template object
   */
  private generateMarkdown(template: StrategyTemplate): string {
    const lines: string[] = [];
    
    lines.push(`# ${template.name}`);
    lines.push('');
    lines.push('## Metadata');
    lines.push(`- riskLevel: ${template.metadata.riskLevel}`);
    lines.push(`- experience: ${template.metadata.experience}`);
    lines.push(`- timeCommitment: ${template.metadata.timeCommitment}`);
    if (template.metadata.timeToReturns) {
      lines.push(`- timeToReturns: ${template.metadata.timeToReturns}`);
    }
    if (template.metadata.occupancyRequired) {
      lines.push(`- occupancyRequired: ${template.metadata.occupancyRequired}`);
    }
    lines.push('');
    lines.push('## Description');
    lines.push(template.description);
    lines.push('');
    lines.push('## Requirements');
    template.requirements.forEach(req => {
      lines.push(`- ${req}`);
    });
    lines.push('');
    lines.push('## Implementation Steps');
    template.implementation.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`);
    });
    lines.push('');
    lines.push('## Scoring Weights');
    Object.entries(template.scoringWeights).forEach(([factor, weight]) => {
      lines.push(`- ${factor}: ${Math.round(weight * 100)}%`);
    });
    lines.push('');
    lines.push('## Best Markets');
    template.bestMarkets.forEach(market => {
      lines.push(`- ${market}`);
    });
    lines.push('');
    lines.push('## Risks');
    template.risks.forEach(risk => {
      lines.push(`- ${risk}`);
    });
    
    if (template.lastUpdated) {
      lines.push('');
      lines.push(`<!-- Last updated: ${template.lastUpdated.toISOString()} by ${template.updatedBy} -->`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Get all available template IDs
   */
  getAllTemplateIds(): string[] {
    return Array.from(this.cache.keys());
  }
  
  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: 'beginner' | 'intermediate' | 'advanced'): StrategyTemplate[] {
    return Array.from(this.cache.values()).filter(t => t.category === category);
  }
}

// Export singleton instance
export const templateManager = new TemplateManager();
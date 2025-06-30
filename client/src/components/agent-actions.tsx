import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, MessageCircle } from "lucide-react";
import { type BuyerProfile } from "@shared/schema";

interface AgentAction {
  id: string;
  emoji: string;
  action: string;
  reason: string;
  type: 'listing' | 'communication';
}

interface AgentActionsProps {
  profile: BuyerProfile;
  persona?: {
    urgencyLevel: number;
    communicationStyle?: string;
    decisionMakingStyle?: string;
    personalityTraits: string[];
  };
}

function generateAgentActions(profile: BuyerProfile, persona?: AgentActionsProps['persona']): AgentAction[] {
  const actions: AgentAction[] = [];
  
  // Extract key data points
  const urgencyLevel = persona?.urgencyLevel || 50;
  const locationFlexibility = profile.locationFlexibility || 50;
  const personalityTraits = persona?.personalityTraits || [];
  const decisionMakingStyle = persona?.decisionMakingStyle || '';
  
  // Determine urgency category
  const urgency = urgencyLevel >= 70 ? 'high' : urgencyLevel >= 40 ? 'medium' : 'low';
  
  // Determine persona type from traits and decision making style
  const isResearchHeavy = personalityTraits.includes('research-heavy') || 
                         decisionMakingStyle === 'research-heavy' ||
                         personalityTraits.includes('analytical');
  
  const isOverwhelmed = personalityTraits.includes('overwhelmed') || 
                       personalityTraits.includes('anxious') ||
                       personalityTraits.includes('first-time-buyer');

  // LISTING-RELATED ACTIONS (max 1)
  
  // Rule 1: High urgency + low location flexibility
  if (urgency === 'high' && locationFlexibility < 40) {
    actions.push({
      id: 'urgent-listings',
      emoji: '🔥',
      action: 'Send top 3 listings today',
      reason: `High urgency with focused location preference`,
      type: 'listing'
    });
  }
  // Rule 2: Research-heavy persona
  else if (isResearchHeavy) {
    actions.push({
      id: 'data-driven',
      emoji: '📊',
      action: 'Include data-driven comps',
      reason: `Research-focused buyer needs detailed market data`,
      type: 'listing'
    });
  }
  // Rule 3: Medium urgency with flexible location
  else if (urgency === 'medium' && locationFlexibility >= 60) {
    actions.push({
      id: 'expand-search',
      emoji: '🗺️',
      action: 'Expand search to 3 nearby areas',
      reason: `Open to different locations with moderate timeline`,
      type: 'listing'
    });
  }

  // COMMUNICATION-RELATED ACTIONS (max 1)
  
  // Rule 1: Overwhelmed persona
  if (isOverwhelmed) {
    actions.push({
      id: 'simplify-call',
      emoji: '🙋',
      action: 'Offer short call to simplify process',
      reason: `Buyer shows signs of feeling overwhelmed`,
      type: 'communication'
    });
  }
  // Rule 2: High urgency without overwhelm
  else if (urgency === 'high' && !isOverwhelmed) {
    actions.push({
      id: 'quick-check',
      emoji: '⚡',
      action: 'Schedule 15-min availability check',
      reason: `High urgency needs immediate coordination`,
      type: 'communication'
    });
  }
  // Rule 3: Research-heavy persona
  else if (isResearchHeavy) {
    actions.push({
      id: 'detailed-report',
      emoji: '📋',
      action: 'Send detailed market analysis',
      reason: `Data-driven buyer appreciates thorough reports`,
      type: 'communication'
    });
  }

  // Return max 2 actions (1 listing + 1 communication)
  const listingAction = actions.find(a => a.type === 'listing');
  const commAction = actions.find(a => a.type === 'communication');
  
  const result = [];
  if (listingAction) result.push(listingAction);
  if (commAction) result.push(commAction);
  
  return result.slice(0, 2); // Ensure max 2 actions
}

export default function AgentActions({ profile, persona }: AgentActionsProps) {
  const actions = generateAgentActions(profile, persona);

  if (actions.length === 0) {
    return null; // Don't show section if no actions
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Agent Actions
          <Badge variant="outline" className="ml-auto">
            {actions.length} suggestion{actions.length > 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {actions.map((action) => (
            <div
              key={action.id}
              className="flex items-start gap-3 p-3 rounded-lg border bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <span className="text-xl">{action.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{action.action}</div>
                <div className="text-xs text-gray-600 mt-1">{action.reason}</div>
              </div>
              <Badge variant={action.type === 'listing' ? 'default' : 'secondary'} className="text-xs">
                {action.type === 'listing' ? (
                  <Target className="h-3 w-3 mr-1" />
                ) : (
                  <MessageCircle className="h-3 w-3 mr-1" />
                )}
                {action.type}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
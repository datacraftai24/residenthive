import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import {
  MessageSquare,
  Mail,
  Check,
  AlertCircle,
  Copy,
  Zap,
  Target,
  Clock,
  FileText,
  Send,
  User,
  Phone,
  MapPin,
  DollarSign,
  Home,
  Calendar,
  Loader2,
  Rocket,
  Flame,
  Thermometer,
  Snowflake,
  PhoneCall,
  MessageCircle,
  CheckCircle2,
  Circle,
  MousePointerClick,
  HelpCircle,
  Eye,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Activity,
  Edit3,
  Train,
  GraduationCap,
  Shield,
  Car,
  AlertTriangle,
} from "lucide-react";
import TaskQueue from "./task-queue";

// ============================================================================
// TYPES
// ============================================================================

interface LeadData {
  id: number;
  source: string;
  leadType: string;
  leadTypeReason: string;
  role: string;
  roleReason: string;
  intentScore: number;
  intentReasons: string[];
  extractionConfidence: number;
  rawInput: string;
  extractedName: string | null;
  extractedEmail: string | null;
  extractedPhone: string | null;
  extractedLocation: string | null;
  extractedBudget: string | null;
  extractedBudgetMin: number | null;
  extractedBudgetMax: number | null;
  extractedBedrooms: number | null;
  extractedBathrooms: string | null;
  extractedHomeType: string | null;
  extractedTimeline: string | null;
  hints: string[];
  whatToClarify: string[];
  suggestedMessage: string | null;
  clarifyingQuestion: string | null;
  propertyAddress: string | null;
  propertyListPrice: number | null;
  propertyBedrooms: number | null;
  propertyBathrooms: string | null;
  propertySqft: number | null;
  propertyImageUrl: string | null;
  createdAt: string;
  engagedAt: string | null;
  convertedAt: string | null;
  reportSentAt: string | null;
  reportShareId: string | null;
}

interface ProfileLeadResponse {
  hasLead: boolean;
  createdByMethod: string;
  lead?: LeadData;
}

interface ChatSessionSummary {
  sessionId?: string;
  totalMessages: number;
  engagementLevel: string;
  readiness: string;
  ctaShown?: boolean;
  ctaClicked?: boolean;
  contactCaptured?: boolean;
  preferences: Record<string, any>;
  propertiesDiscussed: string[];
  lastActivity?: string;
}

interface ChatInsights {
  riskTopicsDiscussed: string[];
  topQuestions: string[];
  objections: string[];
  suggestedAction: string;
  followUpMessage: string;
}

interface ChatSessionResponse {
  sessions: any[];
  hasSession: boolean;
  summary: ChatSessionSummary | null;
  insights: ChatInsights | null;
}

// Buyer insights types
interface NextStep {
  action: string;
  type: "property" | "pricing" | "negotiation" | "communication" | "showing";
  priority: "high" | "medium";
}

interface PropertyInterest {
  listingId: string;
  address: string;
  interestLevel: "Hot" | "Warm" | "Cold";
  positiveSignals: string[];
  negativeSignals: string[];
  questionsAsked: string[];
  agentRecommendation: string;
}

interface MustHaveItem {
  item: string;
  confidence: "Confirmed" | "Likely" | "Assumed";
}

interface BuyerInsightsReport {
  clientSnapshot: {
    buyerType: string;
    priceSensitivity: string;
    urgencySignal: string;
    decisionDrivers: string[];
  };
  mustHaves: MustHaveItem[];
  dealbreakers: MustHaveItem[];
  propertyInterest: PropertyInterest[];
  crossPropertyInsights: string[];
  nextSteps: NextStep[];
}

interface BuyerInsightsResponse {
  profileId: number;
  hasData: boolean;
  report: BuyerInsightsReport;
  stats: {
    messagesAnalyzed: number;
    propertiesSaved: number;
  };
}

interface LeadIntelTabProps {
  profileId: number;
}

// New types for email drafts and engagement
interface EmailDraft {
  subject: string;
  greeting: string;
  body: string;
  callToAction: string;
  signature: string;
  fullMessage: string;
}

interface EngagementMetrics {
  messageCount: number;
  engagementLevel: string;
  lastActiveMinutes: number;
  ctaClicked: boolean;
  readiness: string;
  score: number; // 0-100
}

interface TopicInsight {
  topic: string;
  label: string;
  icon: React.ElementType;
}

// Lead Quadrant Classification
type LeadQuadrantType = "HOT" | "READY" | "RESEARCHING" | "COLD";

interface LeadQuadrant {
  quadrant: LeadQuadrantType;
  actionType: "CALL_NOW" | "CALL_TODAY" | "EMAIL_VALUE" | "NURTURE";
  toneGuidance: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

// Property analysis data from backend (for hidden gems, market position)
interface PropertyAnalysis {
  hiddenGems?: string[];
  redFlags?: string[];
  whatsMatching?: string[];
  marketPosition?: {
    daysOnMarket?: number;
    priceCutsCount?: number;
    totalPriceReduction?: number;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const sourceConfig: Record<string, { bg: string; text: string; label: string }> = {
  zillow: { bg: "bg-blue-100", text: "text-blue-800", label: "Zillow" },
  redfin: { bg: "bg-red-100", text: "text-red-800", label: "Redfin" },
  google: { bg: "bg-green-100", text: "text-green-800", label: "Google" },
  referral: { bg: "bg-purple-100", text: "text-purple-800", label: "Referral" },
  unknown: { bg: "bg-gray-100", text: "text-gray-800", label: "Direct" },
};

const leadTypeLabels: Record<string, string> = {
  property_specific: "Property Specific",
  area_search: "Area Search",
  general: "General Inquiry",
};

const getLeadTemperature = (intentScore: number) => {
  if (intentScore >= 60) return { label: "HOT", color: "bg-red-500", textColor: "text-red-700", bgLight: "bg-red-50", icon: Flame };
  if (intentScore >= 35) return { label: "WARM", color: "bg-amber-500", textColor: "text-amber-700", bgLight: "bg-amber-50", icon: Thermometer };
  return { label: "COLD", color: "bg-blue-400", textColor: "text-blue-700", bgLight: "bg-blue-50", icon: Snowflake };
};

const LEAD_STAGES = [
  { id: "new", label: "New", icon: Circle },
  { id: "contacted", label: "Contacted", icon: MessageCircle },
  { id: "qualified", label: "Qualified", icon: CheckCircle2 },
  { id: "showing", label: "Showing", icon: Home },
  { id: "offer", label: "Offer", icon: FileText },
  { id: "closed", label: "Closed", icon: CheckCircle2 },
];

// ============================================================================
// HELPER FUNCTIONS FOR ENGAGEMENT & EMAIL
// ============================================================================

/**
 * Calculate composite engagement score (0-100) from chat signals
 * Uses logarithmic scale for message count to better distribute scores
 * 5 msgs = ~19pts, 20 msgs = ~35pts, 50+ msgs = ~45pts, 78 msgs = ~50pts
 */
function calculateEngagementScore(chatSummary: ChatSessionSummary | null): EngagementMetrics {
  if (!chatSummary) {
    return {
      messageCount: 0,
      engagementLevel: "NONE",
      lastActiveMinutes: -1,
      ctaClicked: false,
      readiness: "UNKNOWN",
      score: 0,
    };
  }

  let score = 0;

  // Message count (0-35 points) - logarithmic scale for better distribution
  // 5 msgs = ~19pts, 20 msgs = ~35pts (max), 50+ msgs = 35pts (capped)
  // Formula: log2(messages + 1) * 8, capped at 35
  const msgPoints = Math.min(35, Math.log2(chatSummary.totalMessages + 1) * 8);
  score += msgPoints;

  // CTA clicked (15 points)
  if (chatSummary.ctaClicked) {
    score += 15;
  }

  // Readiness level (0-20 points)
  const readinessPoints: Record<string, number> = {
    HIGH: 20,
    MEDIUM: 10,
    LOW: 5,
  };
  score += readinessPoints[chatSummary.readiness] || 0;

  // Recency of activity (0-30 points) - increased weight for recency
  let lastActiveMinutes = -1;
  if (chatSummary.lastActivity) {
    const lastActive = new Date(chatSummary.lastActivity);
    const now = new Date();
    lastActiveMinutes = Math.floor((now.getTime() - lastActive.getTime()) / 60000);

    // Active within 1 hour = 30pts (was 20)
    // Active within 6 hours = 20pts (new tier)
    // Active within 24 hours = 12pts (was 10)
    // Active within 7 days = 5pts
    if (lastActiveMinutes < 60) {
      score += 30;
    } else if (lastActiveMinutes < 360) {
      score += 20;
    } else if (lastActiveMinutes < 1440) {
      score += 12;
    } else if (lastActiveMinutes < 10080) {
      score += 5;
    }
  }

  return {
    messageCount: chatSummary.totalMessages,
    engagementLevel: chatSummary.engagementLevel || "NONE",
    lastActiveMinutes,
    ctaClicked: chatSummary.ctaClicked || false,
    readiness: chatSummary.readiness || "UNKNOWN",
    score: Math.min(100, score),
  };
}

/**
 * Extract topic categories from exact questions (privacy-conscious)
 * Converts specific questions into topic labels for agent preparation
 */
function extractTopicsFromQuestions(questions: string[] | undefined): TopicInsight[] {
  if (!questions || questions.length === 0) return [];

  const topics: TopicInsight[] = [];
  const seenTopics = new Set<string>();

  const topicPatterns: { keywords: string[]; topic: string; label: string; icon: React.ElementType }[] = [
    {
      keywords: ["commute", "train", "transit", "station", "subway", "bus", "transportation", "drive", "driving"],
      topic: "commute",
      label: "Has commute/transit concerns",
      icon: Train,
    },
    {
      keywords: ["school", "district", "education", "elementary", "middle", "high school"],
      topic: "schools",
      label: "Asked about schools",
      icon: GraduationCap,
    },
    {
      keywords: ["budget", "price", "afford", "expensive", "cost", "payment", "mortgage"],
      topic: "budget",
      label: "Budget sensitivity",
      icon: DollarSign,
    },
    {
      keywords: ["safety", "crime", "neighborhood", "safe", "secure", "dangerous"],
      topic: "safety",
      label: "Safety concerns",
      icon: Shield,
    },
    {
      keywords: ["parking", "garage", "driveway", "car", "street parking"],
      topic: "parking",
      label: "Parking questions",
      icon: Car,
    },
  ];

  for (const question of questions) {
    const lowerQ = question.toLowerCase();
    for (const pattern of topicPatterns) {
      if (!seenTopics.has(pattern.topic) && pattern.keywords.some(kw => lowerQ.includes(kw))) {
        seenTopics.add(pattern.topic);
        topics.push({
          topic: pattern.topic,
          label: pattern.label,
          icon: pattern.icon,
        });
      }
    }
  }

  return topics;
}

/**
 * Categorize objections into concern types
 */
function categorizeObjections(objections: string[] | undefined): TopicInsight[] {
  if (!objections || objections.length === 0) return [];

  const concerns: TopicInsight[] = [];
  const seenConcerns = new Set<string>();

  for (const objection of objections) {
    const lower = objection.toLowerCase();

    if (!seenConcerns.has("price") && (lower.includes("price") || lower.includes("expensive") || lower.includes("too much"))) {
      seenConcerns.add("price");
      concerns.push({ topic: "price", label: "Price concerns raised", icon: DollarSign });
    }

    if (!seenConcerns.has("location") && (lower.includes("location") || lower.includes("far") || lower.includes("area"))) {
      seenConcerns.add("location");
      concerns.push({ topic: "location", label: "Location concerns", icon: MapPin });
    }

    if (!seenConcerns.has("condition") && (lower.includes("condition") || lower.includes("old") || lower.includes("repair") || lower.includes("update"))) {
      seenConcerns.add("condition");
      concerns.push({ topic: "condition", label: "Property condition concerns", icon: AlertTriangle });
    }
  }

  return concerns;
}

/**
 * Classify lead into 4-quadrant matrix based on intent + engagement scores
 *
 * HIGH ENGAGEMENT
 *       |
 * RESEARCHING  |  HOT
 * (Build Trust) | (Close Now)
 *       |
 * LOW INTENT --|-- HIGH INTENT
 *       |
 * COLD         |  READY
 * (Nurture)    | (One Push)
 *       |
 * LOW ENGAGEMENT
 */
function classifyLeadQuadrant(intentScore: number, engagementScore: number): LeadQuadrant {
  const highIntent = intentScore >= 50;
  const highEngagement = engagementScore >= 60;

  if (highIntent && highEngagement) {
    return {
      quadrant: "HOT",
      actionType: "CALL_NOW",
      toneGuidance: "Direct and action-oriented. They're ready to move forward.",
      description: "High engagement with high intent - ready to close",
      color: "text-red-700",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
    };
  }

  if (highIntent && !highEngagement) {
    return {
      quadrant: "READY",
      actionType: "CALL_TODAY",
      toneGuidance: "Warm and inviting. Create urgency without pressure.",
      description: "High intent but lower engagement - needs one push",
      color: "text-orange-700",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
    };
  }

  if (!highIntent && highEngagement) {
    return {
      quadrant: "RESEARCHING",
      actionType: "EMAIL_VALUE",
      toneGuidance: "Educational and helpful. Answer their questions, build trust. Don't push too hard yet.",
      description: "High engagement but still researching - build trust first",
      color: "text-blue-700",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
    };
  }

  return {
    quadrant: "COLD",
    actionType: "NURTURE",
    toneGuidance: "Value-first approach. Share market updates and helpful content.",
    description: "Lower engagement and intent - nurture with value",
    color: "text-slate-600",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
  };
}

/**
 * Generate quadrant-aware email draft using all available data
 * Different quadrants get different tones and content strategies:
 * - HOT: Direct, action-oriented, schedule showing
 * - READY: Warm, inviting, create urgency
 * - RESEARCHING: Educational, value-first, answer questions
 * - COLD: Value-first nurture, market updates
 */
function generateFullEmailDraft(
  lead: LeadData,
  chatSummary: ChatSessionSummary | null,
  chatInsights: ChatInsights | null,
  buyerInsights: BuyerInsightsResponse | null,
  quadrant?: LeadQuadrant,
  propertyAnalysis?: PropertyAnalysis
): EmailDraft {
  const name = lead.extractedName || "there";
  const firstName = name.split(" ")[0];
  const address = lead.propertyAddress;
  const topics = extractTopicsFromQuestions(chatInsights?.topQuestions);

  // Get the quadrant type for customization
  const quadrantType = quadrant?.quadrant || "COLD";

  // Build subject line based on quadrant and context
  let subject = "Following up on your property inquiry";

  if (quadrantType === "RESEARCHING" && topics.length > 0) {
    // Reference their specific concern in subject
    const mainTopic = topics[0];
    if (mainTopic.topic === "commute" && address) {
      subject = `Commute times from ${address} + a few things I noticed`;
    } else if (mainTopic.topic === "schools" && address) {
      subject = `School info for ${address} + neighborhood details`;
    } else if (mainTopic.topic === "safety" && address) {
      subject = `Neighborhood safety report for ${address}`;
    } else if (address) {
      subject = `Some details I researched about ${address}`;
    }
  } else if (quadrantType === "HOT" && address) {
    subject = `Let's get you into ${address} this week`;
  } else if (quadrantType === "READY" && address) {
    subject = `${address} - ready when you are`;
  } else if (address) {
    subject = `Following up on ${address}`;
  }

  // Build greeting
  const greeting = `Hi ${firstName},`;

  // Build body paragraphs based on quadrant
  const bodyParts: string[] = [];

  // === HOT LEAD EMAIL: Direct, action-oriented ===
  if (quadrantType === "HOT") {
    if (address) {
      bodyParts.push(`I can tell you're serious about ${address} - and I don't blame you. Here's why I think it deserves a closer look:`);
    } else {
      bodyParts.push("I can tell you're serious about finding the right home. Here's what I've put together:");
    }

    // Add property strengths as checkmarks
    const strengths: string[] = [];
    if (propertyAnalysis?.hiddenGems && propertyAnalysis.hiddenGems.length > 0) {
      strengths.push(...propertyAnalysis.hiddenGems.slice(0, 2));
    }
    if (buyerInsights?.hasData && buyerInsights.report.mustHaves.length > 0) {
      const confirmed = buyerInsights.report.mustHaves
        .filter(m => m.confidence === "Confirmed")
        .slice(0, 1);
      if (confirmed.length > 0) {
        strengths.push(`${confirmed[0].item} (your must-have)`);
      }
    }

    // Add commute info if they asked about it
    const commuteTopic = topics.find(t => t.topic === "commute");
    if (commuteTopic) {
      strengths.push("Convenient commute (details below)");
    }

    // Budget fit
    const budget = lead.extractedBudgetMax || lead.extractedBudgetMin;
    const propertyPrice = lead.propertyListPrice;
    if (budget && propertyPrice && propertyPrice <= budget) {
      const budgetK = Math.round(budget / 1000);
      const priceK = Math.round(propertyPrice / 1000);
      strengths.push(`$${priceK}K = right at your $${budgetK}K budget with no stretch`);
    }

    if (strengths.length > 0) {
      bodyParts.push(strengths.map(s => `✓ ${s}`).join("\n"));
    }

    // Negotiation leverage
    if (propertyAnalysis?.marketPosition?.priceCutsCount && propertyAnalysis.marketPosition.priceCutsCount > 0) {
      bodyParts.push(`The seller has already reduced the price ${propertyAnalysis.marketPosition.priceCutsCount} time${propertyAnalysis.marketPosition.priceCutsCount > 1 ? "s" : ""}. That tells me there's room to negotiate if we move quickly.`);
    }

  // === RESEARCHING LEAD EMAIL: Educational, value-first ===
  } else if (quadrantType === "RESEARCHING") {
    // Open by addressing their specific question
    if (topics.length > 0) {
      const mainTopic = topics[0];
      if (mainTopic.topic === "commute") {
        bodyParts.push("You asked about commute times - here's what I found:");
        // Add placeholder for commute data (would be filled from property analysis)
        if (address) {
          bodyParts.push(`From ${address}:\n- Nearby transit options and commute times vary by destination\n- Happy to research specific routes for your workplace`);
        }
      } else if (mainTopic.topic === "schools") {
        bodyParts.push("You asked about schools - here's what I researched:");
        bodyParts.push("I can provide detailed school ratings and district information for this area.");
      } else if (mainTopic.topic === "safety") {
        bodyParts.push("You asked about the neighborhood - here's what I found:");
        bodyParts.push("I've looked into the area safety statistics and can share more details.");
      } else {
        bodyParts.push(`I've been looking into your questions and have some information to share.`);
      }
    } else if (address) {
      bodyParts.push(`Thank you for your interest in ${address}. I've done some research and have some helpful information.`);
    } else {
      bodyParts.push("I've been doing some research based on your search criteria.");
    }

    // Add hidden gems / property strengths
    if (propertyAnalysis?.hiddenGems && propertyAnalysis.hiddenGems.length > 0) {
      bodyParts.push("A few things that stood out in my research:\n" +
        propertyAnalysis.hiddenGems.slice(0, 3).map(gem => `- ${gem}`).join("\n"));
    } else if (lead.hints && lead.hints.length > 0) {
      bodyParts.push("A few things that stood out:\n" +
        lead.hints.slice(0, 3).map(hint => `- ${hint}`).join("\n"));
    }

    // Negotiation info (provides value, shows expertise)
    if (propertyAnalysis?.marketPosition?.priceCutsCount && propertyAnalysis.marketPosition.priceCutsCount > 0) {
      const reduction = propertyAnalysis.marketPosition.totalPriceReduction;
      const reductionText = reduction ? ` (total $${Math.round(reduction / 1000)}K off)` : "";
      bodyParts.push(`Also worth noting - the price has been reduced ${propertyAnalysis.marketPosition.priceCutsCount} time${propertyAnalysis.marketPosition.priceCutsCount > 1 ? "s" : ""} already${reductionText}, which suggests the seller may be flexible.`);
    }

  // === READY LEAD EMAIL: Warm, create urgency without pressure ===
  } else if (quadrantType === "READY") {
    if (address) {
      bodyParts.push(`I wanted to follow up on ${address} - it seems like a strong match for what you're looking for.`);
    } else {
      bodyParts.push("I wanted to follow up on the properties we discussed.");
    }

    // Budget fit
    const budget = lead.extractedBudgetMax || lead.extractedBudgetMin;
    const propertyPrice = lead.propertyListPrice;
    if (budget && propertyPrice) {
      const budgetK = Math.round(budget / 1000);
      const priceK = Math.round(propertyPrice / 1000);
      if (propertyPrice <= budget) {
        bodyParts.push(`At $${priceK}K, this fits well within your $${budgetK}K budget.`);
      }
    }

    // Hidden gems
    if (propertyAnalysis?.hiddenGems && propertyAnalysis.hiddenGems.length > 0) {
      bodyParts.push("A few highlights:\n" +
        propertyAnalysis.hiddenGems.slice(0, 2).map(gem => `- ${gem}`).join("\n"));
    }

    // Market position
    if (propertyAnalysis?.marketPosition?.daysOnMarket && propertyAnalysis.marketPosition.daysOnMarket > 30) {
      bodyParts.push(`It's been on the market for ${propertyAnalysis.marketPosition.daysOnMarket} days, which means there may be room for negotiation.`);
    }

  // === COLD LEAD EMAIL: Value-first nurture ===
  } else {
    if (address) {
      bodyParts.push(`Thank you for your interest in ${address}! I wanted to share some helpful information.`);
    } else {
      bodyParts.push("Thank you for reaching out! I wanted to follow up with some helpful information about the market.");
    }

    // Budget context
    const budget = lead.extractedBudgetMax || lead.extractedBudgetMin;
    if (budget) {
      const budgetK = Math.round(budget / 1000);
      bodyParts.push(`With your budget around $${budgetK}K, there are some good options available. I can help you find properties that match your criteria.`);
    }

    // General value add
    if (lead.hints && lead.hints.length > 0) {
      bodyParts.push("Based on what I've learned about your preferences:\n" +
        lead.hints.slice(0, 2).map(hint => `- ${hint}`).join("\n"));
    }
  }

  const body = bodyParts.join("\n\n");

  // Build CTA based on quadrant
  let callToAction: string;
  if (quadrantType === "HOT") {
    callToAction = "I have availability Wednesday and Thursday afternoon.\nWhich works better for a showing?";
  } else if (quadrantType === "READY") {
    callToAction = "Would this week work for a quick showing? I'm flexible with timing.";
  } else if (quadrantType === "RESEARCHING") {
    callToAction = "Happy to dig into any other questions. Just reply here.";
  } else {
    callToAction = "Let me know if you'd like me to send over more information or if you have any questions.";
  }

  // Signature
  const signature = "Best,\n[Your Name]";

  // Full message
  const fullMessage = `${greeting}\n\n${body}\n\n${callToAction}\n\n${signature}`;

  return {
    subject,
    greeting,
    body,
    callToAction,
    signature,
    fullMessage,
  };
}

// ============================================================================
// LEAD QUADRANT INDICATOR (Replaces EngagementScoreIndicator)
// ============================================================================

function LeadQuadrantIndicator({
  intentScore,
  engagementMetrics,
}: {
  intentScore: number;
  engagementMetrics: EngagementMetrics;
}) {
  const engagementScore = engagementMetrics.score;
  const quadrant = classifyLeadQuadrant(intentScore, engagementScore);

  // Check for significant mismatch (engagement much higher than intent)
  const hasMismatch = engagementScore >= 60 && intentScore < 50 && (engagementScore - intentScore) >= 30;

  // Format last active time
  const formatLastActive = (minutes: number) => {
    if (minutes < 0) return "Unknown";
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return `${Math.floor(minutes / 1440)}d ago`;
  };

  if (engagementMetrics.messageCount === 0) return null;

  // Icon based on quadrant
  const QuadrantIcon = quadrant.quadrant === "HOT" ? Flame :
    quadrant.quadrant === "READY" ? Rocket :
    quadrant.quadrant === "RESEARCHING" ? Eye :
    Snowflake;

  // Action label
  const actionLabels: Record<string, string> = {
    CALL_NOW: "CALL NOW",
    CALL_TODAY: "CALL/TEXT TODAY",
    EMAIL_VALUE: "EMAIL VALUE",
    NURTURE: "NURTURE DRIP",
  };

  return (
    <div className={`rounded-lg border-2 ${quadrant.borderColor} ${quadrant.bgColor} overflow-hidden`}>
      {/* Main Quadrant Header */}
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${quadrant.quadrant === "HOT" ? "bg-red-100" : quadrant.quadrant === "READY" ? "bg-orange-100" : quadrant.quadrant === "RESEARCHING" ? "bg-blue-100" : "bg-slate-200"}`}>
              <QuadrantIcon className={`h-5 w-5 ${quadrant.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-lg ${quadrant.color}`}>
                  [{quadrant.quadrant}]
                </span>
                <span className="text-sm text-slate-600">
                  {quadrant.description}
                </span>
              </div>
            </div>
          </div>
          <Badge className={`${quadrant.bgColor} ${quadrant.color} border ${quadrant.borderColor}`}>
            Action: {actionLabels[quadrant.actionType]}
          </Badge>
        </div>

        {/* Score Details Row */}
        <div className="mt-3 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-slate-500" />
            <span className="text-slate-600">Intent:</span>
            <span className="font-semibold">{intentScore}</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-500" />
            <span className="text-slate-600">Engagement:</span>
            <span className="font-semibold">{engagementScore}</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-slate-500" />
            <span className="text-slate-600">{engagementMetrics.messageCount} msgs</span>
          </div>
          {engagementMetrics.lastActiveMinutes >= 0 && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500" />
              <span className="text-slate-600">{formatLastActive(engagementMetrics.lastActiveMinutes)}</span>
            </div>
          )}
          {engagementMetrics.ctaClicked && (
            <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">
              <MousePointerClick className="h-3 w-3 mr-1" />
              CTA clicked
            </Badge>
          )}
        </div>
      </div>

      {/* Mismatch Alert */}
      {hasMismatch && (
        <div className="px-3 py-2 bg-amber-100 border-t border-amber-200 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <strong>ATTENTION:</strong> Engagement ({engagementScore}) much higher than intent ({intentScore}).
            This buyer is more engaged than the score suggests.
          </div>
        </div>
      )}

      {/* Communication Tone Guidance */}
      <div className="px-3 py-2 bg-white/60 border-t border-slate-200">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Communication Tone</p>
        <p className="text-sm text-slate-700">{quadrant.toneGuidance}</p>
      </div>
    </div>
  );
}

// ============================================================================
// AGENT PREP CHECKLIST (Consolidated preparation info)
// ============================================================================

interface AgentPrepChecklistProps {
  topics: TopicInsight[];
  concerns: TopicInsight[];
  riskTopics?: string[];
  propertyStrengths?: string[];
  buyerBudget?: number | null;
  propertyPrice?: number | null;
  negotiationPoints?: {
    priceCuts?: number;
    totalReduction?: number;
    daysOnMarket?: number;
  };
  lead: LeadData;
}

function AgentPrepChecklist({
  topics,
  concerns,
  riskTopics,
  propertyStrengths,
  buyerBudget,
  propertyPrice,
  negotiationPoints,
  lead,
}: AgentPrepChecklistProps) {
  // Build sections only if they have content
  const hasTopics = topics.length > 0;
  const hasConcerns = concerns.length > 0;
  const hasRiskTopics = riskTopics && riskTopics.length > 0;
  const hasPropertyStrengths = propertyStrengths && propertyStrengths.length > 0;
  const hasBudgetInfo = buyerBudget && propertyPrice;
  const hasNegotiationPoints = negotiationPoints && (negotiationPoints.priceCuts || negotiationPoints.daysOnMarket);

  // Check if there's any content to show
  const hasAnyContent = hasTopics || hasConcerns || hasRiskTopics || hasPropertyStrengths || hasBudgetInfo || hasNegotiationPoints;

  if (!hasAnyContent) return null;

  // Format budget comparison
  const getBudgetFitLabel = () => {
    if (!buyerBudget || !propertyPrice) return null;
    const diff = propertyPrice - buyerBudget;
    const percentDiff = Math.abs(diff / buyerBudget) * 100;

    if (diff <= 0) {
      return {
        label: "✓ Within budget",
        detail: `Property $${(propertyPrice / 1000).toFixed(0)}K vs Budget $${(buyerBudget / 1000).toFixed(0)}K`,
        color: "text-green-700",
      };
    } else if (percentDiff <= 5) {
      return {
        label: "~ Slightly over budget",
        detail: `Property $${(propertyPrice / 1000).toFixed(0)}K vs Budget $${(buyerBudget / 1000).toFixed(0)}K (+${percentDiff.toFixed(0)}%)`,
        color: "text-amber-700",
      };
    } else {
      return {
        label: "! Over budget",
        detail: `Property $${(propertyPrice / 1000).toFixed(0)}K vs Budget $${(buyerBudget / 1000).toFixed(0)}K (+${percentDiff.toFixed(0)}%)`,
        color: "text-red-700",
      };
    }
  };

  const budgetFit = getBudgetFitLabel();

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <h3 className="font-medium text-sm flex items-center gap-2 text-slate-700">
          <CheckCircle2 className="h-4 w-4 text-slate-500" />
          BEFORE YOU CONTACT
        </h3>
      </div>

      <div className="p-4 space-y-4">
        {/* What They Care About */}
        {(hasTopics || hasBudgetInfo) && (
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              What They Care About
            </p>
            <ul className="space-y-1.5">
              {topics.map((topic, i) => (
                <li key={`topic-${i}`} className="flex items-center gap-2 text-sm">
                  <topic.icon className="h-4 w-4 text-blue-500" />
                  <span className="text-slate-700">{topic.label}</span>
                </li>
              ))}
              {budgetFit && (
                <li className="flex items-center gap-2 text-sm">
                  <DollarSign className={`h-4 w-4 ${budgetFit.color}`} />
                  <span className={budgetFit.color}>{budgetFit.label}</span>
                  <span className="text-slate-500 text-xs">({budgetFit.detail})</span>
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Objections to Address */}
        {hasConcerns && (
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              Objections to Address
            </p>
            <ul className="space-y-1.5">
              {concerns.map((concern, i) => (
                <li key={`concern-${i}`} className="flex items-start gap-2 text-sm">
                  <concern.icon className="h-4 w-4 text-amber-500 mt-0.5" />
                  <span className="text-slate-700">{concern.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Topics to Verify */}
        {hasRiskTopics && (
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              Topics to Verify
            </p>
            <ul className="space-y-1.5">
              {riskTopics!.slice(0, 3).map((topic, i) => (
                <li key={`risk-${i}`} className="flex items-center gap-2 text-sm">
                  <HelpCircle className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600">{topic}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Property Strengths to Highlight */}
        {hasPropertyStrengths && (
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              Property Strengths to Highlight
            </p>
            <ul className="space-y-1.5">
              {propertyStrengths!.slice(0, 4).map((strength, i) => (
                <li key={`strength-${i}`} className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <span className="text-slate-700">{strength}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Negotiation Points */}
        {hasNegotiationPoints && (
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              Negotiation Points (if discussing price)
            </p>
            <ul className="space-y-1.5">
              {negotiationPoints!.priceCuts && negotiationPoints.priceCuts > 0 && (
                <li className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span className="text-slate-700">
                    Price reduced {negotiationPoints.priceCuts}x
                    {negotiationPoints.totalReduction && ` (total $${(negotiationPoints.totalReduction / 1000).toFixed(0)}K off)`}
                    {" "}- seller may be motivated
                  </span>
                </li>
              )}
              {negotiationPoints!.daysOnMarket && negotiationPoints.daysOnMarket > 30 && (
                <li className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-green-500" />
                  <span className="text-slate-700">
                    {negotiationPoints.daysOnMarket} days on market - room for offers
                  </span>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// FULL EMAIL DRAFT SECTION
// ============================================================================

function FullEmailDraftSection({
  lead,
  chatSummary,
  chatInsights,
  buyerInsights,
  onSendEmail,
  quadrant,
  propertyAnalysis,
}: {
  lead: LeadData;
  chatSummary: ChatSessionSummary | null;
  chatInsights: ChatInsights | null;
  buyerInsights: BuyerInsightsResponse | null;
  onSendEmail: (subject: string, body: string) => Promise<void>;
  quadrant?: LeadQuadrant;
  propertyAnalysis?: PropertyAnalysis;
}) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("template"); // Default to template since it's now quadrant-aware

  // Generate quadrant-aware template draft
  const templateDraft = useMemo(
    () => generateFullEmailDraft(lead, chatSummary, chatInsights, buyerInsights, quadrant, propertyAnalysis),
    [lead, chatSummary, chatInsights, buyerInsights, quadrant, propertyAnalysis]
  );

  // AI draft comes from backend's followUpMessage
  const aiDraftBody = chatInsights?.followUpMessage || "";

  // State for edited content
  const [editedSubject, setEditedSubject] = useState(templateDraft.subject);
  const [editedBody, setEditedBody] = useState(
    activeTab === "ai" && aiDraftBody ? aiDraftBody : templateDraft.fullMessage
  );

  // Update edited content when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === "ai" && aiDraftBody) {
      setEditedBody(aiDraftBody);
    } else {
      setEditedBody(templateDraft.fullMessage);
    }
  };

  const handleCopy = () => {
    const textToCopy = isEditing ? editedBody : (activeTab === "ai" && aiDraftBody ? aiDraftBody : templateDraft.fullMessage);
    navigator.clipboard.writeText(textToCopy);
    toast({
      title: "Copied",
      description: "Email body copied to clipboard",
    });
  };

  const handleSend = async () => {
    if (!lead.extractedEmail) {
      toast({
        title: "No email address",
        description: "Lead has no email on file",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      await onSendEmail(editedSubject, editedBody);
    } finally {
      setIsSending(false);
    }
  };

  const toEmail = lead.extractedEmail;

  return (
    <div className="bg-slate-100 rounded-lg border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-slate-600" />
          <span className="text-sm font-medium text-slate-700">Email Draft</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            className="h-7 px-2 text-xs"
          >
            <Edit3 className="h-3 w-3 mr-1" />
            {isEditing ? "Preview" : "Edit"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2 text-xs">
            <Copy className="h-3 w-3 mr-1" />
            Copy
          </Button>
        </div>
      </div>

      {/* Tabs for AI vs Template */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b border-slate-200 bg-slate-50 h-9 px-2">
          <TabsTrigger value="ai" className="text-xs" disabled={!aiDraftBody}>
            <Sparkles className="h-3 w-3 mr-1" />
            AI Draft
          </TabsTrigger>
          <TabsTrigger value="template" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            Template
          </TabsTrigger>
        </TabsList>

        <div className="p-4 space-y-3">
          {/* To field */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 w-16">To:</span>
            <span className="text-slate-700">{toEmail || "No email on file"}</span>
          </div>

          {/* Subject field */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 w-16">Subject:</span>
            {isEditing ? (
              <input
                type="text"
                value={editedSubject}
                onChange={(e) => setEditedSubject(e.target.value)}
                className="flex-1 px-2 py-1 border rounded text-sm"
              />
            ) : (
              <span className="text-slate-700">{editedSubject}</span>
            )}
          </div>

          {/* Body */}
          <TabsContent value="ai" className="mt-0">
            {isEditing ? (
              <Textarea
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                className="min-h-[200px] text-sm"
              />
            ) : (
              <div className="bg-white rounded-lg p-3 border border-slate-200 min-h-[200px]">
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {aiDraftBody || "No AI-generated draft available. Use the Template tab."}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="template" className="mt-0">
            {isEditing ? (
              <Textarea
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                className="min-h-[200px] text-sm"
              />
            ) : (
              <div className="bg-white rounded-lg p-3 border border-slate-200 min-h-[200px]">
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{templateDraft.fullMessage}</p>
              </div>
            )}
          </TabsContent>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!toEmail || isSending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Send Email
            </Button>
          </div>
        </div>
      </Tabs>
    </div>
  );
}

// ============================================================================
// SECTION 1: LEAD STATUS BAR (Compact Header)
// ============================================================================

function LeadStatusBar({
  intentScore,
  stage,
  timeline,
  lastActive,
  onStageChange,
}: {
  intentScore: number;
  stage: string;
  timeline?: string | null;
  lastActive?: string | null;
  onStageChange?: (stage: string) => void;
}) {
  const temp = getLeadTemperature(intentScore);
  const TempIcon = temp.icon;
  const currentIndex = LEAD_STAGES.findIndex(s => s.id === stage);

  const formatLastActive = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };

  return (
    <Card className="border-slate-200 bg-gradient-to-r from-slate-50 to-white">
      <CardContent className="py-3 px-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Left: Temperature + Score + Timeline */}
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${temp.bgLight} border`}>
              <TempIcon className={`h-4 w-4 ${temp.textColor}`} />
              <span className={`font-bold ${temp.textColor}`}>{temp.label} LEAD</span>
              <span className="text-sm text-muted-foreground">({intentScore}/100)</span>
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="font-medium text-slate-700">Stage:</span>
                {LEAD_STAGES.find(s => s.id === stage)?.label || "New"}
              </span>
              {timeline && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {timeline}
                </span>
              )}
              {lastActive && (
                <span className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  Active {formatLastActive(lastActive)}
                </span>
              )}
            </div>
          </div>

          {/* Right: Stage Tracker (compact) */}
          <div className="flex items-center gap-1">
            {LEAD_STAGES.slice(0, 4).map((s, index) => {
              const isCompleted = index < currentIndex;
              const isCurrent = index === currentIndex;
              return (
                <button
                  key={s.id}
                  onClick={() => onStageChange?.(s.id)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                    isCompleted ? "bg-green-500 text-white" :
                    isCurrent ? "bg-blue-500 text-white ring-2 ring-blue-200" :
                    "bg-slate-200 text-slate-400"
                  }`}
                  title={s.label}
                >
                  {isCompleted ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SECTION 2: BUYER ACTIVITY FEED
// ============================================================================

function BuyerActivityFeed({
  chatSummary,
  insights,
  lead,
}: {
  chatSummary: ChatSessionSummary | null;
  insights: ChatInsights | null;
  lead: LeadData;
}) {
  const hasActivity = chatSummary && chatSummary.totalMessages > 0;
  const hasHighIntentSignals = chatSummary?.ctaClicked || (chatSummary?.engagementLevel === "HIGH");

  if (!hasActivity) {
    return (
      <Card className="border-dashed border-slate-300">
        <CardContent className="py-6 text-center">
          <MessageCircle className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-muted-foreground">No buyer activity yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Activity will appear once the buyer engages with the report
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={hasHighIntentSignals ? "border-green-200 bg-green-50/30" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Buyer Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* High Intent Signals */}
        {hasHighIntentSignals && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-green-700 uppercase tracking-wide flex items-center gap-1">
              <Flame className="h-3 w-3" />
              High Intent Signals
            </p>
            <div className="flex flex-wrap gap-2">
              {chatSummary?.ctaClicked && (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <MousePointerClick className="h-3 w-3 mr-1" />
                  Clicked "Schedule Showing" CTA
                </Badge>
              )}
              {chatSummary?.engagementLevel === "HIGH" && (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <MessageCircle className="h-3 w-3 mr-1" />
                  High Engagement ({chatSummary.totalMessages} messages)
                </Badge>
              )}
              {chatSummary?.readiness === "HIGH" && (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <Target className="h-3 w-3 mr-1" />
                  Ready to Buy
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Chat Summary */}
        <div className="flex items-center gap-3 text-sm">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <span>
            <strong>{chatSummary?.totalMessages}</strong> messages
            {chatSummary?.propertiesDiscussed?.length > 0 && (
              <> about <strong>{chatSummary.propertiesDiscussed.length}</strong> properties</>
            )}
          </span>
          <Badge variant="outline" className="text-xs">
            {chatSummary?.engagementLevel} engagement
          </Badge>
        </div>

        {/* Open Questions from Buyer */}
        {insights?.topQuestions && insights.topQuestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide flex items-center gap-1">
              <HelpCircle className="h-3 w-3" />
              Open Questions from Buyer
            </p>
            <div className="space-y-1.5 bg-slate-50 rounded-lg p-3">
              {insights.topQuestions.slice(0, 3).map((question, i) => (
                <p key={i} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="text-slate-400 mt-0.5">•</span>
                  "{question}"
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SECTION 3: AI RECOMMENDED ACTION (HERO SECTION)
// ============================================================================

function AIRecommendedAction({
  lead,
  chatSummary,
  chatInsights,
  buyerInsights,
  onCall,
  onText,
  onSendEmail,
}: {
  lead: LeadData;
  chatSummary: ChatSessionSummary | null;
  chatInsights: ChatInsights | null;
  buyerInsights: BuyerInsightsResponse | null;
  onCall: () => void;
  onText: () => void;
  onSendEmail: (subject: string, body: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const emailDraftRef = React.useRef<HTMLDivElement>(null);

  // Handler to scroll to email draft section
  const handleScrollToEmailDraft = () => {
    emailDraftRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Calculate engagement metrics
  const engagementMetrics = useMemo(
    () => calculateEngagementScore(chatSummary),
    [chatSummary]
  );

  // Classify lead into quadrant
  const quadrant = useMemo(
    () => classifyLeadQuadrant(lead.intentScore, engagementMetrics.score),
    [lead.intentScore, engagementMetrics.score]
  );

  // Extract topics from questions (privacy-conscious)
  const topicInsights = useMemo(
    () => extractTopicsFromQuestions(chatInsights?.topQuestions),
    [chatInsights?.topQuestions]
  );

  // Categorize objections
  const concernInsights = useMemo(
    () => categorizeObjections(chatInsights?.objections),
    [chatInsights?.objections]
  );

  // Determine the recommended action using quadrant-based logic
  const getRecommendedAction = () => {
    const ctaClicked = chatSummary?.ctaClicked;
    const hasPhone = !!lead.extractedPhone;
    const hasEmail = !!lead.extractedEmail;

    // Priority 1: CTA clicked = call immediately (regardless of quadrant)
    if (ctaClicked && hasPhone) {
      return {
        action: "CALL",
        headline: `CALL ${lead.extractedName?.toUpperCase() || "BUYER"} NOW`,
        reason: "They clicked \"Schedule Showing\" and are actively engaged. Strike while the iron is hot!",
        urgency: "high",
      };
    }

    // Use quadrant to determine action
    switch (quadrant.quadrant) {
      case "HOT":
        // High intent + high engagement = call now
        if (hasPhone) {
          return {
            action: "CALL",
            headline: `CALL ${lead.extractedName?.toUpperCase() || "BUYER"} NOW`,
            reason: `HOT lead with high intent (${lead.intentScore}) and engagement (${engagementMetrics.score}). They're ready to move forward.`,
            urgency: "high",
          };
        }
        if (hasEmail) {
          return {
            action: "EMAIL",
            headline: "EMAIL IMMEDIATELY - HOT LEAD",
            reason: `HOT lead ready to act. No phone available - send action-oriented email now.`,
            urgency: "high",
          };
        }
        break;

      case "READY":
        // High intent + lower engagement = one push needed
        if (hasPhone) {
          return {
            action: "CALL",
            headline: "CALL/TEXT TODAY",
            reason: `READY lead with high intent (${lead.intentScore}). One good conversation could close this.`,
            urgency: "high",
          };
        }
        if (hasEmail) {
          return {
            action: "EMAIL",
            headline: "EMAIL TODAY - READY TO ACT",
            reason: `READY lead needs a push. Create some urgency in your outreach.`,
            urgency: "medium",
          };
        }
        break;

      case "RESEARCHING":
        // Lower intent but high engagement = build trust first
        // Key insight: These buyers are NOT cold, they're researching
        if (hasEmail) {
          return {
            action: "EMAIL",
            headline: "EMAIL VALUE CONTENT",
            reason: `RESEARCHING buyer (${engagementMetrics.messageCount} msgs, engagement ${engagementMetrics.score}). Send helpful info to build trust - don't push for showing yet.`,
            urgency: "medium",
          };
        }
        if (hasPhone) {
          return {
            action: "TEXT",
            headline: "TEXT WITH HELPFUL INFO",
            reason: `RESEARCHING buyer with high engagement. Text helpful info, don't push too hard.`,
            urgency: "medium",
          };
        }
        break;

      case "COLD":
        // Lower intent + lower engagement = nurture
        if (hasEmail) {
          return {
            action: "EMAIL",
            headline: "SEND NURTURE EMAIL",
            reason: "COLD lead - send value-first content. Market updates or helpful info to warm them up.",
            urgency: "low",
          };
        }
        if (hasPhone) {
          return {
            action: "TEXT",
            headline: "SEND INTRO TEXT",
            reason: "Quick text introduction to start the conversation.",
            urgency: "low",
          };
        }
        break;
    }

    return {
      action: "NONE",
      headline: "GATHER CONTACT INFO",
      reason: "No contact information available. Wait for buyer to provide details.",
      urgency: "low",
    };
  };

  const recommendation = getRecommendedAction();

  const urgencyStyles = {
    high: "border-green-300 bg-gradient-to-br from-green-50 to-emerald-50",
    medium: "border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50",
    low: "border-slate-200 bg-slate-50",
  };

  return (
    <Card className={`${urgencyStyles[recommendation.urgency as keyof typeof urgencyStyles]} shadow-sm`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-slate-600">
          <Sparkles className="h-4 w-4 text-amber-500" />
          RECOMMENDED NEXT STEP
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Recommendation */}
        <div className="flex items-center gap-3">
          {recommendation.action === "CALL" && (
            <div className="p-3 rounded-full bg-green-500 text-white">
              <PhoneCall className="h-6 w-6" />
            </div>
          )}
          {recommendation.action === "TEXT" && (
            <div className="p-3 rounded-full bg-blue-500 text-white">
              <MessageCircle className="h-6 w-6" />
            </div>
          )}
          {recommendation.action === "EMAIL" && (
            <div className="p-3 rounded-full bg-purple-500 text-white">
              <Mail className="h-6 w-6" />
            </div>
          )}
          {recommendation.action === "NONE" && (
            <div className="p-3 rounded-full bg-slate-400 text-white">
              <AlertCircle className="h-6 w-6" />
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold text-slate-800">{recommendation.headline}</h3>
            <p className="text-sm text-muted-foreground">{recommendation.reason}</p>
          </div>
        </div>

        {/* Lead Quadrant Indicator (replaces EngagementScoreIndicator) */}
        <LeadQuadrantIndicator
          intentScore={lead.intentScore}
          engagementMetrics={engagementMetrics}
        />

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onCall}
            disabled={!lead.extractedPhone}
            className={`gap-2 ${recommendation.action === "CALL" ? "bg-green-600 hover:bg-green-700" : ""}`}
          >
            <PhoneCall className="h-4 w-4" />
            Call Now
          </Button>
          <Button
            onClick={onText}
            disabled={!lead.extractedPhone}
            variant={recommendation.action === "TEXT" ? "default" : "outline"}
            className={`gap-2 ${recommendation.action === "TEXT" ? "bg-blue-600 hover:bg-blue-700" : ""}`}
          >
            <MessageCircle className="h-4 w-4" />
            Send Text
          </Button>
          <Button
            onClick={handleScrollToEmailDraft}
            disabled={!lead.extractedEmail}
            variant={recommendation.action === "EMAIL" ? "default" : "outline"}
            className={`gap-2 ${recommendation.action === "EMAIL" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
          >
            <Mail className="h-4 w-4" />
            Draft Email
          </Button>
        </div>

        {/* Agent Prep Checklist (consolidated from BuyerTopicInsights and other sources) */}
        <AgentPrepChecklist
          topics={topicInsights}
          concerns={concernInsights}
          riskTopics={chatInsights?.riskTopicsDiscussed}
          propertyStrengths={lead.hints}
          buyerBudget={lead.extractedBudgetMax || lead.extractedBudgetMin}
          propertyPrice={lead.propertyListPrice}
          lead={lead}
        />

        {/* Full Email Draft Section with quadrant-aware content */}
        {recommendation.action !== "NONE" && (
          <div ref={emailDraftRef}>
            <FullEmailDraftSection
              lead={lead}
              chatSummary={chatSummary}
              chatInsights={chatInsights}
              buyerInsights={buyerInsights}
              onSendEmail={onSendEmail}
              quadrant={quadrant}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SECTION 4: DETAILS ACCORDION (Collapsible Secondary Info)
// ============================================================================

function DetailsAccordion({
  lead,
  chatData,
}: {
  lead: LeadData;
  chatData: ChatSessionResponse | null;
}) {
  const source = sourceConfig[lead.source?.toLowerCase()] || sourceConfig.unknown;

  return (
    <Accordion type="multiple" className="space-y-2">
      {/* Conversation History */}
      {chatData?.sessions && chatData.sessions.length > 0 && (
        <AccordionItem value="conversations" className="border rounded-lg px-4 bg-white">
          <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
            <span className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-slate-500" />
              Conversation History
              <Badge variant="secondary" className="text-xs">
                {chatData.summary?.totalMessages || 0} msgs
              </Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 text-sm pb-2">
              {chatData.sessions.slice(0, 3).map((session: any, i: number) => (
                <div key={i} className="p-2 bg-slate-50 rounded text-xs">
                  <p className="text-muted-foreground">
                    Session {i + 1} • {new Date(session.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
              {chatData.sessions.length > 3 && (
                <p className="text-xs text-muted-foreground">
                  + {chatData.sessions.length - 3} more sessions
                </p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      )}

      {/* Lead Profile */}
      <AccordionItem value="profile" className="border rounded-lg px-4 bg-white">
        <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
          <span className="flex items-center gap-2">
            <User className="h-4 w-4 text-slate-500" />
            Lead Profile
            <Badge className={`text-xs ${source.bg} ${source.text} border-0`}>
              {source.label}
            </Badge>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-2 gap-3 text-sm pb-2">
            {lead.extractedName && (
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedName}</span>
              </div>
            )}
            {lead.extractedEmail && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{lead.extractedEmail}</span>
              </div>
            )}
            {lead.extractedPhone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedPhone}</span>
              </div>
            )}
            {lead.extractedLocation && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedLocation}</span>
              </div>
            )}
            {(lead.extractedBudget || lead.extractedBudgetMax) && (
              <div className="flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {lead.extractedBudget ||
                    `Up to $${(lead.extractedBudgetMax! / 1000).toFixed(0)}K`}
                </span>
              </div>
            )}
            {lead.extractedBedrooms && (
              <div className="flex items-center gap-2">
                <Home className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedBedrooms}+ bedrooms</span>
              </div>
            )}
            {lead.extractedTimeline && (
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.extractedTimeline}</span>
              </div>
            )}
          </div>

          {/* Lead type and role */}
          <div className="flex gap-2 mt-2 pt-2 border-t">
            <Badge variant="outline" className="text-xs">
              {leadTypeLabels[lead.leadType] || lead.leadType}
            </Badge>
            <Badge variant="secondary" className="text-xs capitalize">
              {lead.role?.replace("_", " ")}
            </Badge>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Original Message */}
      <AccordionItem value="message" className="border rounded-lg px-4 bg-white">
        <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-slate-500" />
            Original Lead Message
            <Badge variant="outline" className="text-xs">
              {lead.rawInput?.length || 0} chars
            </Badge>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="bg-slate-50 rounded-lg p-3 text-sm whitespace-pre-wrap">
            {lead.rawInput}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Activity Timeline */}
      <AccordionItem value="timeline" className="border rounded-lg px-4 bg-white">
        <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            Activity Timeline
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="relative space-y-3 pb-2">
            <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-200" />

            <TimelineItem
              icon={<MessageSquare className="h-3 w-3" />}
              title="Lead received"
              subtitle={`From ${source.label}`}
              date={lead.createdAt}
              color="blue"
            />

            {lead.convertedAt && (
              <TimelineItem
                icon={<User className="h-3 w-3" />}
                title="Profile created"
                subtitle="Lead converted to buyer profile"
                date={lead.convertedAt}
                color="green"
              />
            )}

            {lead.reportSentAt && (
              <TimelineItem
                icon={<FileText className="h-3 w-3" />}
                title="Buyer report emailed"
                subtitle={lead.extractedEmail ? `Sent to ${lead.extractedEmail}` : "Report sent"}
                date={lead.reportSentAt}
                color="purple"
              />
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Due Diligence Tasks */}
      {lead.reportShareId && (
        <AccordionItem value="tasks" className="border rounded-lg px-4 bg-white">
          <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-slate-500" />
              Due Diligence Tasks
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <TaskQueue leadId={lead.id} shareId={lead.reportShareId} />
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  );
}

// Timeline item component
function TimelineItem({
  icon,
  title,
  subtitle,
  date,
  color = "gray",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  date: string;
  color?: "blue" | "green" | "purple" | "gray";
}) {
  const colorClasses = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    purple: "bg-purple-100 text-purple-600",
    gray: "bg-gray-100 text-gray-600",
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="relative flex items-start gap-3 pl-6">
      <div className={`absolute left-0 w-4 h-4 rounded-full flex items-center justify-center ${colorClasses[color]}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <p className="text-xs text-muted-foreground whitespace-nowrap">
        {formatDate(date)}
      </p>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LeadIntelTab({ profileId }: LeadIntelTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false);
  const [leadStage, setLeadStage] = useState("new");

  // Fetch lead data
  const { data: leadData, isLoading } = useQuery<ProfileLeadResponse>({
    queryKey: [`/api/buyer-profiles/${profileId}/lead`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch chat session data
  const { data: chatData } = useQuery<ChatSessionResponse>({
    queryKey: [`/api/leads/${leadData?.lead?.id}/chat-sessions`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!leadData?.lead?.id && !!leadData?.lead?.reportShareId,
    staleTime: 60 * 1000,
  });

  // Fetch buyer insights
  const { data: buyerInsights } = useQuery<BuyerInsightsResponse>({
    queryKey: [`/api/buyer-insights/${profileId}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
  });

  // Outreach eligibility
  const outreachEligibility = useMemo(() => {
    if (!leadData?.lead) return { canGenerate: false, missing: [] };

    const lead = leadData.lead;
    const missing: string[] = [];

    if (lead.reportSentAt) {
      return { canGenerate: false, missing: [], alreadySent: true };
    }

    const hasEmail = !!lead.extractedEmail;
    const hasBudget = lead.extractedBudgetMin || lead.extractedBudgetMax || lead.propertyListPrice;
    if (!hasBudget) missing.push("budget");

    const hasLocation = lead.extractedLocation || lead.propertyAddress;
    if (!hasLocation) missing.push("location");

    return { canGenerate: missing.length === 0, missing, alreadySent: false, hasEmail };
  }, [leadData]);

  const handleGenerateOutreach = async () => {
    if (!leadData?.lead?.id) return;

    setIsGeneratingOutreach(true);
    try {
      const response = await apiRequest("POST", `/api/leads/${leadData.lead.id}/generate-outreach`, {});
      const data = await response.json();

      if (data.emailSent) {
        toast({
          title: "Report sent!",
          description: `Report with ${data.propertiesIncluded} properties emailed to ${data.emailSentTo}`,
        });
      } else {
        toast({
          title: "Report generated!",
          description: `Report with ${data.propertiesIncluded} properties ready to share.`,
        });
      }

      queryClient.invalidateQueries({ queryKey: [`/api/buyer-profiles/${profileId}/lead`] });

      if (data.reportUrl) {
        window.open(data.reportUrl, "_blank");
      }
    } catch (error: any) {
      toast({
        title: "Outreach failed",
        description: error?.message || "Failed to generate outreach",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingOutreach(false);
    }
  };

  // Action handlers
  const handleCall = () => {
    if (leadData?.lead?.extractedPhone) {
      window.open(`tel:${leadData.lead.extractedPhone}`);
      toast({ title: "Calling...", description: `Dialing ${leadData.lead.extractedPhone}` });
    }
  };

  const handleText = () => {
    if (leadData?.lead?.extractedPhone) {
      const message = encodeURIComponent(
        `Hi ${leadData.lead.extractedName || "there"}, following up on your property inquiry.`
      );
      window.open(`sms:${leadData.lead.extractedPhone}?body=${message}`);
    }
  };

  const handleEmail = () => {
    if (leadData?.lead?.extractedEmail) {
      const subject = encodeURIComponent("Following up on your property inquiry");
      window.open(`mailto:${leadData.lead.extractedEmail}?subject=${subject}`);
    }
  };

  // Send email via backend API
  const handleSendEmail = async (subject: string, body: string) => {
    if (!leadData?.lead?.id || !leadData?.lead?.extractedEmail) {
      toast({
        title: "Cannot send email",
        description: "Lead has no email address on file",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest("POST", `/api/leads/${leadData.lead.id}/send-email`, {
        to_email: leadData.lead.extractedEmail,
        subject,
        body,
      });

      if (response.ok) {
        toast({
          title: "Email sent",
          description: `Sent to ${leadData.lead.extractedEmail}`,
        });
        // Refresh lead data to show updated status
        queryClient.invalidateQueries({ queryKey: [`/api/buyer-profiles/${profileId}/lead`] });
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast({
          title: "Failed to send email",
          description: errorData.detail || "An error occurred while sending the email",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Failed to send email",
        description: error?.message || "An error occurred while sending the email",
        variant: "destructive",
      });
    }
  };

  const handleStageChange = (newStage: string) => {
    setLeadStage(newStage);
    toast({
      title: "Stage Updated",
      description: `Lead moved to "${LEAD_STAGES.find(s => s.id === newStage)?.label}"`,
    });
  };

  const getCurrentStage = () => {
    if (leadData?.lead?.reportSentAt) return "contacted";
    if (leadData?.lead?.convertedAt) return "new";
    return "new";
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // No lead data
  if (!leadData?.hasLead || !leadData.lead) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">
            Profile Created Manually
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            This buyer profile was created directly, not from a lead.
            Lead intelligence is only available for profiles converted from incoming leads.
          </p>
        </CardContent>
      </Card>
    );
  }

  const lead = leadData.lead;

  return (
    <div className="space-y-4">
      {/* Section 1: Lead Status Bar */}
      <LeadStatusBar
        intentScore={lead.intentScore}
        stage={getCurrentStage()}
        timeline={lead.extractedTimeline}
        lastActive={chatData?.summary?.lastActivity}
        onStageChange={handleStageChange}
      />

      {/* Generate Outreach CTA (if not sent) */}
      {!outreachEligibility.alreadySent && (
        <Card className={`${outreachEligibility.canGenerate ? "border-green-300 bg-green-50/50" : "border-amber-200 bg-amber-50/30"}`}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${outreachEligibility.canGenerate ? "bg-green-100" : "bg-amber-100"}`}>
                  <Rocket className={`h-5 w-5 ${outreachEligibility.canGenerate ? "text-green-600" : "text-amber-600"}`} />
                </div>
                <div>
                  <h3 className="font-medium text-sm">
                    {outreachEligibility.hasEmail ? "One-Click Outreach" : "Generate Report"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {!outreachEligibility.canGenerate
                      ? `Missing: ${outreachEligibility.missing.join(", ")}`
                      : outreachEligibility.hasEmail
                        ? "Search, generate, and email automatically"
                        : "Generate shareable report"}
                  </p>
                </div>
              </div>
              <Button
                onClick={handleGenerateOutreach}
                disabled={isGeneratingOutreach || !outreachEligibility.canGenerate}
                size="sm"
                className={outreachEligibility.canGenerate ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {isGeneratingOutreach ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-1" />
                    {outreachEligibility.hasEmail ? "Generate & Send" : "Generate"}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Sent Notice */}
      {outreachEligibility.alreadySent && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100">
                  <Check className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-medium text-sm text-purple-700">Report Sent</h3>
                  <p className="text-xs text-muted-foreground">
                    {lead.extractedEmail
                      ? `Emailed on ${new Date(lead.reportSentAt!).toLocaleDateString()}`
                      : `Created on ${new Date(lead.reportSentAt!).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              {lead.reportShareId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/buyer-report/${lead.reportShareId}`, "_blank")}
                >
                  View Report
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 2: Buyer Activity Feed */}
      {outreachEligibility.alreadySent && (
        <BuyerActivityFeed
          chatSummary={chatData?.summary || null}
          insights={chatData?.insights || null}
          lead={lead}
        />
      )}

      {/* Section 3: AI Recommended Action (THE HERO) */}
      {outreachEligibility.alreadySent && (
        <AIRecommendedAction
          lead={lead}
          chatSummary={chatData?.summary || null}
          chatInsights={chatData?.insights || null}
          buyerInsights={buyerInsights || null}
          onCall={handleCall}
          onText={handleText}
          onSendEmail={handleSendEmail}
        />
      )}

      {/* Section 4: Collapsible Details */}
      <DetailsAccordion lead={lead} chatData={chatData || null} />
    </div>
  );
}

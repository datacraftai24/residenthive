from typing import Optional, List, Literal
from pydantic import BaseModel, Field
from datetime import datetime


# Buyer Profile models (subset aligned with shared/schema.ts)
class BuyerProfileBase(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    location: str
    agentId: Optional[int] = None

    buyerType: Optional[str] = "traditional"

    budget: str
    budgetMin: Optional[int] = None
    budgetMax: Optional[int] = None
    homeType: str
    bedrooms: int
    maxBedrooms: Optional[int] = None
    minBedrooms: Optional[int] = None
    bathrooms: str
    minBathrooms: Optional[float] = None

    investorType: Optional[str] = None
    investmentCapital: Optional[int] = None
    targetMonthlyReturn: Optional[int] = None
    targetCapRate: Optional[float] = None
    investmentStrategy: Optional[str] = None

    mustHaveFeatures: List[str] = Field(default_factory=list)
    dealbreakers: List[str] = Field(default_factory=list)
    preferredAreas: List[str] = Field(default_factory=list)
    lifestyleDrivers: List[str] = Field(default_factory=list)
    specialNeeds: List[str] = Field(default_factory=list)

    budgetFlexibility: Optional[int] = 50
    locationFlexibility: Optional[int] = 50
    timingFlexibility: Optional[int] = 50

    emotionalContext: Optional[str] = None
    voiceTranscript: Optional[str] = None
    inferredTags: List[str] = Field(default_factory=list)
    emotionalTone: Optional[str] = None
    priorityScore: Optional[int] = 50

    # AI-generated insights (migrations 007, 008)
    aiSummary: Optional[str] = None
    decisionDrivers: List[str] = Field(default_factory=list)
    constraints: List[str] = Field(default_factory=list)
    niceToHaves: List[str] = Field(default_factory=list)
    flexibilityExplanations: Optional[dict] = Field(default_factory=dict)
    visionChecklist: Optional[dict] = Field(default_factory=dict)

    rawInput: str = ""
    inputMethod: str = "form"
    nlpConfidence: Optional[int] = 100
    version: Optional[int] = 1
    parentProfileId: Optional[int] = None

    # Commute fields
    workAddress: Optional[str] = None
    maxCommuteMins: Optional[int] = None


class BuyerProfileCreate(BuyerProfileBase):
    pass


class BuyerProfileUpdate(BaseModel):
    # Allow partial updates
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    agentId: Optional[int] = None
    buyerType: Optional[str] = None
    budget: Optional[str] = None
    budgetMin: Optional[int] = None
    budgetMax: Optional[int] = None
    homeType: Optional[str] = None
    bedrooms: Optional[int] = None
    maxBedrooms: Optional[int] = None
    minBedrooms: Optional[int] = None
    bathrooms: Optional[str] = None
    minBathrooms: Optional[float] = None
    investorType: Optional[str] = None
    investmentCapital: Optional[int] = None
    targetMonthlyReturn: Optional[int] = None
    targetCapRate: Optional[float] = None
    investmentStrategy: Optional[str] = None
    mustHaveFeatures: Optional[List[str]] = None
    dealbreakers: Optional[List[str]] = None
    preferredAreas: Optional[List[str]] = None
    lifestyleDrivers: Optional[List[str]] = None
    specialNeeds: Optional[List[str]] = None
    budgetFlexibility: Optional[int] = None
    locationFlexibility: Optional[int] = None
    timingFlexibility: Optional[int] = None
    emotionalContext: Optional[str] = None
    voiceTranscript: Optional[str] = None
    inferredTags: Optional[List[str]] = None
    emotionalTone: Optional[str] = None
    priorityScore: Optional[int] = None
    # AI-generated insights (migrations 007, 008)
    aiSummary: Optional[str] = None
    decisionDrivers: Optional[List[str]] = None
    constraints: Optional[List[str]] = None
    niceToHaves: Optional[List[str]] = None
    flexibilityExplanations: Optional[dict] = None
    visionChecklist: Optional[dict] = None
    rawInput: Optional[str] = None
    inputMethod: Optional[str] = None
    nlpConfidence: Optional[int] = None
    version: Optional[int] = None
    parentProfileId: Optional[int] = None
    # Commute fields
    workAddress: Optional[str] = None
    maxCommuteMins: Optional[int] = None


class BuyerProfile(BuyerProfileBase):
    id: int
    createdAt: str
    # Lead tracking (migration 015)
    parentLeadId: Optional[int] = None
    createdByMethod: Optional[str] = "agent"  # 'lead' or 'agent'


# ============================================================
# LEAD MODELS
# Leads have a separate lifecycle from buyer_profiles
# ============================================================

class LeadClassification(BaseModel):
    """Deterministic classification result (no LLM)"""
    role: Literal["buyer_lead", "investor", "agent", "unknown"]
    roleReason: str  # Why this role was assigned
    leadType: Literal["property_specific", "area_search", "general"]
    leadTypeReason: str  # Why this lead type was assigned


class LeadExtracted(BaseModel):
    """Fields extracted by LLM (all nullable for unknown-safe extraction)"""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    budget: Optional[str] = None  # Display format: "$500K-$600K"
    budgetMin: Optional[int] = None
    budgetMax: Optional[int] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[str] = None
    homeType: Optional[str] = None
    timeline: Optional[str] = None
    hints: List[str] = Field(default_factory=list)  # Soft signals


class LeadBase(BaseModel):
    """Base lead model with all fields"""
    # Classification (deterministic)
    role: Literal["buyer_lead", "investor", "agent", "unknown"]
    roleReason: str
    leadType: Literal["property_specific", "area_search", "general"]
    leadTypeReason: str

    # Source
    source: str = "unknown"  # zillow, redfin, google, referral, unknown
    propertyUrl: Optional[str] = None
    propertyAddress: Optional[str] = None

    # Intent (deterministic scoring)
    intentScore: int  # 0-100
    intentReasons: List[str] = Field(default_factory=list)

    # Extracted data (from LLM)
    extractedName: Optional[str] = None
    extractedEmail: Optional[str] = None
    extractedPhone: Optional[str] = None
    extractedLocation: Optional[str] = None
    extractedBudget: Optional[str] = None
    extractedBudgetMin: Optional[int] = None
    extractedBudgetMax: Optional[int] = None
    extractedBedrooms: Optional[int] = None
    extractedBathrooms: Optional[str] = None
    extractedHomeType: Optional[str] = None
    extractedTimeline: Optional[str] = None
    hints: List[str] = Field(default_factory=list)

    # Response
    suggestedMessage: Optional[str] = None
    clarifyingQuestion: Optional[str] = None
    whatToClarify: List[str] = Field(default_factory=list)

    # MLS Search
    mlsSearchStatus: Optional[str] = None  # performed, failed, no_results, skipped_no_constraints
    mlsMatches: Optional[List[dict]] = None

    # Confidence
    extractionConfidence: Optional[int] = None

    # Property details (from Repliers API lookup for property-specific leads)
    propertyListingId: Optional[str] = None  # MLS listing ID
    propertyListPrice: Optional[int] = None  # Listing price at time of lead
    propertyBedrooms: Optional[int] = None
    propertyBathrooms: Optional[str] = None
    propertySqft: Optional[int] = None
    propertyImageUrl: Optional[str] = None  # Primary image
    propertyRaw: Optional[dict] = None  # Full Repliers API response

    # Raw input
    rawInput: str
    rawInputNormalized: str


class LeadCreate(LeadBase):
    """Model for creating a new lead"""
    agentId: Optional[int] = None
    status: str = "classified"


class Lead(LeadBase):
    """Lead response model with ID and timestamps"""
    id: int
    agentId: Optional[int] = None
    status: str  # new, classified, engaged, converted, archived
    createdAt: str
    engagedAt: Optional[str] = None
    convertedAt: Optional[str] = None
    convertedProfileId: Optional[int] = None
    # Report tracking (migration 017)
    reportSentAt: Optional[str] = None
    reportShareId: Optional[str] = None


class LeadUpdate(BaseModel):
    """Model for updating lead status"""
    status: Optional[str] = None
    engagedAt: Optional[str] = None
    convertedAt: Optional[str] = None
    convertedProfileId: Optional[int] = None


# ============================================================
# LEAD API REQUEST/RESPONSE MODELS
# ============================================================

class LeadExtractionRequest(BaseModel):
    """Request to process a lead"""
    rawText: str
    source: Optional[str] = "unknown"  # zillow, redfin, google, referral
    propertyUrlOrAddress: Optional[str] = None


class LeadCard(BaseModel):
    """Agent-facing lead card with classification + response"""
    classification: LeadClassification
    intentScore: int
    intentReasons: List[str]
    whatToClarify: List[str]  # Prioritized missing fields
    suggestedMessage: str
    clarifyingQuestion: Optional[str] = None
    mlsSearchStatus: Optional[str] = None
    mlsMatches: Optional[List[dict]] = None
    extractionConfidence: int


class LeadExtractionResponse(BaseModel):
    """Response from lead processing"""
    lead: Lead
    card: LeadCard


class LeadContext(BaseModel):
    """Context from parent lead for report generation"""
    leadId: int
    source: str  # zillow, redfin, google, referral
    leadType: str  # property_specific, area_search, general

    # Property details (if property_specific lead)
    propertyAddress: Optional[str] = None
    propertyListPrice: Optional[int] = None
    propertyBedrooms: Optional[int] = None
    propertyBathrooms: Optional[str] = None
    propertySqft: Optional[int] = None
    propertyImageUrl: Optional[str] = None
    propertyListingId: Optional[str] = None

    # Lead's original message/intent
    originalMessage: Optional[str] = None  # Truncated rawInput
    timeline: Optional[str] = None  # When they're looking


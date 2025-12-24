from typing import Optional, List
from pydantic import BaseModel, Field


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


class BuyerProfile(BuyerProfileBase):
    id: int
    createdAt: str


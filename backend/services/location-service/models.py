"""
Pydantic models for Location Intelligence Service
Defines strict JSON schemas for location analysis requests and responses
"""

from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class StreetType(str, Enum):
    """Types of streets for property classification"""
    RESIDENTIAL_SIDE_STREET = "residential_side_street"
    COLLECTOR = "collector"
    ARTERIAL = "arterial"
    HIGHWAY_ADJACENT = "highway_adjacent"


class TrafficLevel(str, Enum):
    """Traffic volume levels"""
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class NoiseRisk(str, Enum):
    """Noise risk assessment"""
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class RouteType(str, Enum):
    """Primary route composition for commutes"""
    HIGHWAY_MAJORITY = "highway_majority"
    LOCAL_ROADS = "local_roads"
    MIXED = "mixed"


class WalkabilityLabel(str, Enum):
    """Overall walkability assessment"""
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class FlagLevel(str, Enum):
    """Severity levels for location flags"""
    GREEN = "green"
    YELLOW = "yellow"
    RED = "red"


class FlagCategory(str, Enum):
    """Categories for location flags"""
    COMMUTE = "commute"
    NOISE = "noise"
    WALKABILITY = "walkability"
    FAMILY_FRIENDLY = "family_friendly"
    AMENITIES = "amenities"
    ORIENTATION = "orientation"


class FacingDirection(str, Enum):
    """Cardinal directions for house facing"""
    NORTH = "north"
    SOUTH = "south"
    EAST = "east"
    WEST = "west"
    NORTHEAST = "northeast"
    NORTHWEST = "northwest"
    SOUTHEAST = "southeast"
    SOUTHWEST = "southwest"
    UNKNOWN = "unknown"


class OrientationConfidence(str, Enum):
    """Confidence levels for orientation detection"""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# Request Models

class BuyerLocationPrefs(BaseModel):
    """Buyer location preferences for tailored analysis"""
    # Legacy fields (still supported for backward compat)
    work_address: Optional[str] = Field(None, description="Work address for commute calculation. Null = skip commute")
    max_commute_mins: int = Field(35, description="Maximum acceptable commute time in minutes")
    prioritize_quiet_street: bool = Field(False, description="Whether buyer prioritizes low-traffic streets")
    prioritize_walkability: bool = Field(False, description="Whether buyer prioritizes walkable neighborhoods")
    has_kids: bool = Field(False, description="Whether buyer has children (affects park/playground importance)")

    # NEW: Structured signals from profile_normalizer (version 2)
    signals: Optional[List[dict]] = Field(None, description="Structured location signals from profile")
    profile_id: Optional[str] = Field(None, description="Profile ID for logging/debugging")


class LocationRequest(BaseModel):
    """Request to analyze a property location"""
    address: str = Field(..., description="Full property address to analyze")
    buyer_prefs: Optional[BuyerLocationPrefs] = Field(None, description="Buyer preferences for tailored analysis")


# Response Models

class CommuteAnalysis(BaseModel):
    """Commute time and route analysis"""
    work_address: Optional[str] = Field(None, description="Work destination address")
    drive_peak_mins: Optional[int] = Field(None, description="Driving time during peak hours (minutes)")
    drive_offpeak_mins: Optional[int] = Field(None, description="Driving time during off-peak hours (minutes)")
    distance_miles: Optional[float] = Field(None, description="Total distance in miles")
    route_type: Optional[RouteType] = Field(None, description="Primary route composition")


class StreetContext(BaseModel):
    """Street type and traffic context"""
    street_type: Optional[StreetType] = Field(None, description="Classification of street type")
    traffic_level: Optional[TrafficLevel] = Field(None, description="Expected traffic volume level")
    near_major_road_meters: Optional[int] = Field(None, description="Distance to nearest major road in meters")
    noise_risk: Optional[NoiseRisk] = Field(None, description="Assessed noise risk level")
    is_cul_de_sac: Optional[bool] = Field(None, description="Whether property is on a cul-de-sac")


class AmenitiesProximity(BaseModel):
    """Proximity to key amenities (driving time in minutes)"""
    grocery_drive_mins: Optional[int] = Field(None, description="Drive time to nearest grocery store")
    pharmacy_drive_mins: Optional[int] = Field(None, description="Drive time to nearest pharmacy")
    cafes_drive_mins: Optional[int] = Field(None, description="Drive time to cafes/restaurants")
    primary_school_drive_mins: Optional[int] = Field(None, description="Drive time to primary school")
    train_station_drive_mins: Optional[int] = Field(None, description="Drive time to train/commuter rail station")


class WalkabilityScore(BaseModel):
    """Walkability assessment"""
    sidewalks_present: Optional[bool] = Field(None, description="Whether sidewalks are present on immediate streets")
    closest_park_walk_mins: Optional[int] = Field(None, description="Walk time to closest park (minutes)")
    closest_playground_walk_mins: Optional[int] = Field(None, description="Walk time to closest playground (minutes)")
    overall_walkability_label: Optional[WalkabilityLabel] = Field(None, description="Overall walkability assessment")
    walk_score_estimate: Optional[int] = Field(None, description="Walk Score estimate (0-100) if available from Maps")


class FamilyIndicators(BaseModel):
    """Family-friendly location indicators"""
    nearby_playgrounds_count: Optional[int] = Field(0, description="Number of playgrounds within 1 mile")
    nearby_parks_count: Optional[int] = Field(0, description="Number of parks within 1 mile")
    nearby_schools_count: Optional[int] = Field(0, description="Number of schools within 1 mile")


class HouseOrientation(BaseModel):
    """House facing direction and sun exposure analysis"""
    facing_direction: FacingDirection = Field(FacingDirection.UNKNOWN, description="Cardinal direction the house faces")
    confidence: OrientationConfidence = Field(OrientationConfidence.LOW, description="Confidence level of detection")
    street_bearing: Optional[int] = Field(None, description="Bearing of the street approach in degrees (0-360)")
    street_approach_from: Optional[str] = Field(None, description="Direction from which the street approaches")
    sun_exposure_summary: Optional[str] = Field(None, description="Human-readable sun exposure summary")
    method: str = Field("street_geometry", description="Detection method used")


class LocationFlag(BaseModel):
    """Location-related flags (positive, neutral, or concerns)"""
    level: FlagLevel = Field(..., description="Severity level")
    code: str = Field(..., description="Machine-readable flag code")
    message: str = Field(..., description="Human-readable flag message")
    category: FlagCategory = Field(..., description="Flag category for grouping/icons")


class AnalysisMetadata(BaseModel):
    """Metadata about the analysis"""
    analyzed_at: datetime = Field(default_factory=datetime.utcnow, description="Timestamp of analysis")
    cache_hit: bool = Field(False, description="Whether result was served from cache")
    gemini_model: str = Field("gemini-2.5-flash", description="Gemini model used for analysis")


class LocationAnalysis(BaseModel):
    """Complete location analysis response"""
    address: str = Field(..., description="Property address analyzed")
    commute: Optional[CommuteAnalysis] = Field(None, description="Commute analysis (null if no work_address provided)")
    street_context: StreetContext = Field(..., description="Street type and traffic context")
    amenities: AmenitiesProximity = Field(..., description="Proximity to key amenities")
    walkability: WalkabilityScore = Field(..., description="Walkability assessment")
    family_indicators: FamilyIndicators = Field(..., description="Family-friendly indicators")
    orientation: Optional[HouseOrientation] = Field(None, description="House facing direction and sun exposure")
    flags: List[LocationFlag] = Field(default_factory=list, description="Location flags and concerns")
    metadata: AnalysisMetadata = Field(default_factory=AnalysisMetadata, description="Analysis metadata")


class LocationError(BaseModel):
    """Error response when location analysis fails"""
    address: str = Field(..., description="Property address that failed")
    error: str = Field("LOCATION_UNAVAILABLE", description="Error code")
    message: str = Field(..., description="Human-readable error message")

/**
 * Comprehensive Listing Parser Service
 * 
 * Captures ALL data fields from Repliers API including:
 * - Core property details (price, beds, baths, sqft, etc.)
 * - Full descriptions and remarks
 * - All feature lists (interior, exterior, amenities, appliances)
 * - Complete agent and office information
 * - Tax information
 * - HOA details
 * - Media metadata (not just URLs)
 * - Historical data (price changes, status changes)
 * - Any other fields present in the raw data
 * 
 * Outputs structured data for PostgreSQL storage with quality scoring
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export interface ParsedListing {
  // Primary identifiers
  id: string;
  mls_number: string;
  source: 'repliers' | 'mls' | 'other';
  source_id: string;
  
  // Core searchable fields (for SQL indexes)
  price: number;
  bedrooms: number;
  bathrooms: number;
  property_type: string;
  square_feet?: number;
  year_built?: number;
  
  // Location (denormalized for performance)
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  latitude?: number;
  longitude?: number;
  
  // Status
  status: string;
  list_date?: Date;
  
  // Complete parsed data in structured format
  data: {
    // Property Details
    property: {
      type: string;
      subtype?: string;
      style?: string;
      bedrooms: number;
      bathrooms: number;
      half_baths?: number;
      full_baths?: number;
      total_rooms?: number;
      square_feet?: number;
      lot_size?: string;
      lot_acres?: number;
      year_built?: number;
      year_renovated?: number;
      stories?: number;
      garage_spaces?: number;
      parking_spaces?: number;
      basement?: string;
      foundation?: string;
      roof?: string;
      construction?: string;
      condition?: string;
      view?: string;
      waterfront?: boolean;
    };
    
    // Descriptions (ALL text fields)
    descriptions: {
      main?: string;
      remarks?: string;
      public_remarks?: string;
      private_remarks?: string;
      agent_remarks?: string;
      features?: string;
      inclusions?: string;
      exclusions?: string;
      directions?: string;
      showing_instructions?: string;
      virtual_tour_remarks?: string;
    };
    
    // Features (comprehensive lists)
    features: {
      interior?: string[];
      exterior?: string[];
      amenities?: string[];
      appliances?: string[];
      heating?: string[];
      cooling?: string[];
      utilities?: string[];
      flooring?: string[];
      parking?: string[];
      security?: string[];
      community?: string[];
      pool?: string[];
      other?: string[];
      all?: string[]; // Combined unique list
    };
    
    // Location Details
    location: {
      address: {
        street_number?: string;
        street_name?: string;
        street_suffix?: string;
        unit?: string;
        city: string;
        state: string;
        zip: string;
        county?: string;
        country?: string;
      };
      coordinates?: {
        latitude: number;
        longitude: number;
      };
      neighborhood?: string;
      subdivision?: string;
      school_district?: string;
      schools?: {
        elementary?: string;
        middle?: string;
        high?: string;
      };
      township?: string;
      area?: string;
      cross_streets?: string;
    };
    
    // Financial Information
    financial: {
      list_price: number;
      original_price?: number;
      previous_price?: number;
      sold_price?: number;
      price_per_sqft?: number;
      taxes?: {
        annual_amount?: number;
        year?: number;
        assessment?: number;
        tax_id?: string;
      };
      hoa?: {
        fee?: number;
        frequency?: string;
        includes?: string[];
        name?: string;
      };
      rental?: {
        monthly?: number;
        deposit?: number;
        pet_deposit?: number;
        lease_term?: string;
      };
    };
    
    // Agent/Office Information
    listing_info: {
      agent?: {
        id?: string;
        name?: string;
        phone?: string;
        mobile?: string;
        email?: string;
        license?: string;
      };
      office?: {
        id?: string;
        name?: string;
        phone?: string;
        email?: string;
        address?: string;
      };
      co_agent?: {
        name?: string;
        phone?: string;
        email?: string;
      };
    };
    
    // Media
    media: {
      photos?: Array<{
        url: string;
        caption?: string;
        order?: number;
        width?: number;
        height?: number;
        timestamp?: string;
      }>;
      virtual_tour?: {
        url?: string;
        type?: string;
        provider?: string;
      };
      video?: {
        url?: string;
        duration?: number;
        thumbnail?: string;
      };
      floor_plans?: Array<{
        url: string;
        name?: string;
      }>;
      documents?: Array<{
        url: string;
        name: string;
        type: string;
      }>;
    };
    
    // History
    history: {
      price_changes?: Array<{
        date: Date;
        price: number;
        change_type: string;
      }>;
      status_changes?: Array<{
        date: Date;
        status: string;
        previous_status?: string;
      }>;
      days_on_market?: number;
      cumulative_days?: number;
      listing_date?: Date;
      last_updated?: Date;
      off_market_date?: Date;
      pending_date?: Date;
      sold_date?: Date;
    };
    
    // Additional/Custom Fields
    additional: Record<string, any>;
  };
  
  // Raw data for debugging/reprocessing
  raw_data?: any;
  
  // Data quality
  parse_quality_score: number;
  parse_issues: ParseIssue[];
  
  // Metadata
  parsed_at: Date;
  parser_version: string;
}

interface ParseIssue {
  field: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
}

export class ListingParser {
  private version = '1.0.0';
  
  /**
   * Parse raw listing data from any source
   */
  parse(rawListing: any, source: 'repliers' | 'mls' | 'other' = 'repliers'): ParsedListing {
    const issues: ParseIssue[] = [];
    const startTime = Date.now();
    
    try {
      // Generate IDs
      const id = uuidv4();
      const mlsNumber = this.extractMlsNumber(rawListing);
      const sourceId = this.extractSourceId(rawListing, source);
      
      // Parse core fields
      const coreFields = this.parseCoreFields(rawListing, issues);
      const location = this.parseLocation(rawListing, issues);
      const property = this.parsePropertyDetails(rawListing, issues);
      const descriptions = this.parseDescriptions(rawListing, issues);
      const features = this.parseFeatures(rawListing, issues);
      const financial = this.parseFinancial(rawListing, issues);
      const listingInfo = this.parseListingInfo(rawListing, issues);
      const media = this.parseMedia(rawListing, issues);
      const history = this.parseHistory(rawListing, issues);
      const additional = this.parseAdditionalFields(rawListing);
      
      // Calculate quality score
      const qualityScore = this.calculateQualityScore(
        { property, descriptions, features, financial, listingInfo, media },
        issues
      );
      
      // Build parsed listing
      const parsed: ParsedListing = {
        // Identifiers
        id,
        mls_number: mlsNumber,
        source,
        source_id: sourceId,
        
        // Core searchable fields
        price: coreFields.price,
        bedrooms: coreFields.bedrooms,
        bathrooms: coreFields.bathrooms,
        property_type: coreFields.propertyType,
        square_feet: property.square_feet,
        year_built: property.year_built,
        
        // Location
        street_address: location.address.street_number ? 
          `${location.address.street_number} ${location.address.street_name} ${location.address.street_suffix || ''}`.trim() :
          'Address not available',
        city: location.address.city,
        state: location.address.state,
        zip_code: location.address.zip,
        latitude: location.coordinates?.latitude,
        longitude: location.coordinates?.longitude,
        
        // Status
        status: coreFields.status,
        list_date: history.listing_date,
        
        // Complete data
        data: {
          property,
          descriptions,
          features,
          location,
          financial,
          listing_info: listingInfo,
          media,
          history,
          additional
        },
        
        // Quality
        parse_quality_score: qualityScore,
        parse_issues: issues,
        
        // Metadata
        parsed_at: new Date(),
        parser_version: this.version,
        
        // Raw data (optional)
        raw_data: rawListing
      };
      
      const parseTime = Date.now() - startTime;
      console.log(`✅ Parsed listing ${mlsNumber} in ${parseTime}ms with quality score ${qualityScore}`);
      
      return parsed;
      
    } catch (error) {
      console.error('Failed to parse listing:', error);
      throw error;
    }
  }
  
  /**
   * Extract MLS number from various possible fields
   */
  private extractMlsNumber(raw: any): string {
    return raw.mlsNumber || 
           raw.mls_number || 
           raw.listingId || 
           raw.listing_id || 
           raw.id ||
           `UNKNOWN_${Date.now()}`;
  }
  
  /**
   * Extract source-specific ID
   */
  private extractSourceId(raw: any, source: string): string {
    if (source === 'repliers') {
      return raw.mlsNumber || raw.id || `repliers_${Date.now()}`;
    }
    return raw.id || raw._id || `${source}_${Date.now()}`;
  }
  
  /**
   * Parse core searchable fields
   */
  private parseCoreFields(raw: any, issues: ParseIssue[]): any {
    const price = this.parsePrice(raw);
    if (!price || price <= 0) {
      issues.push({ field: 'price', issue: 'Invalid or missing price', severity: 'high' });
    }
    
    const bedrooms = this.parseBedrooms(raw);
    const bathrooms = this.parseBathrooms(raw);
    const propertyType = this.parsePropertyType(raw);
    const status = this.parseStatus(raw);
    
    return { price, bedrooms, bathrooms, propertyType, status };
  }
  
  /**
   * Parse price from various fields
   */
  private parsePrice(raw: any): number {
    const price = raw.listPrice || 
                  raw.list_price || 
                  raw.price || 
                  raw.askingPrice || 
                  raw.currentPrice || 
                  0;
    
    return typeof price === 'number' ? price : parseFloat(price) || 0;
  }
  
  /**
   * Parse number of bedrooms
   */
  private parseBedrooms(raw: any): number {
    const bedrooms = raw.bedrooms || 
                     raw.beds || 
                     raw.numBedrooms || 
                     raw.details?.numBedrooms || 
                     raw.details?.beds ||
                     0;
    
    return typeof bedrooms === 'number' ? bedrooms : parseInt(bedrooms) || 0;
  }
  
  /**
   * Parse bathrooms (handles various formats like "2.5", "2 full, 1 half")
   */
  private parseBathrooms(raw: any): number {
    // Try simple numeric first
    const simple = raw.bathrooms || 
                   raw.baths || 
                   raw.numBathrooms || 
                   raw.details?.numBathrooms ||
                   raw.details?.baths;
    
    if (simple) {
      if (typeof simple === 'number') return simple;
      if (typeof simple === 'string') {
        // Handle "2.5" format
        const parsed = parseFloat(simple);
        if (!isNaN(parsed)) return parsed;
        
        // Handle "2 full, 1 half" format
        const fullMatch = simple.match(/(\d+)\s*full/i);
        const halfMatch = simple.match(/(\d+)\s*half/i);
        const full = fullMatch ? parseInt(fullMatch[1]) : 0;
        const half = halfMatch ? parseInt(halfMatch[1]) : 0;
        if (full || half) return full + (half * 0.5);
      }
    }
    
    // Try separate full/half bath fields
    const fullBaths = raw.fullBaths || raw.full_baths || raw.details?.fullBaths || 0;
    const halfBaths = raw.halfBaths || raw.half_baths || raw.details?.halfBaths || 0;
    
    return parseFloat(fullBaths) + (parseFloat(halfBaths) * 0.5) || 0;
  }
  
  /**
   * Parse property type
   */
  private parsePropertyType(raw: any): string {
    const type = raw.propertyType || 
                 raw.property_type || 
                 raw.type || 
                 raw.details?.propertyType || 
                 raw.details?.type ||
                 'Residential';
    
    // Normalize common variations
    const normalized = type.toString().toLowerCase();
    if (normalized.includes('house') || normalized.includes('single')) return 'Single Family';
    if (normalized.includes('condo')) return 'Condo';
    if (normalized.includes('town')) return 'Townhouse';
    if (normalized.includes('multi')) return 'Multi-Family';
    
    return type;
  }
  
  /**
   * Parse listing status
   */
  private parseStatus(raw: any): string {
    const status = raw.status || 
                   raw.listingStatus || 
                   raw.lastStatus || 
                   raw.currentStatus ||
                   'Active';
    
    return status.toString();
  }
  
  /**
   * Parse all location-related fields
   */
  private parseLocation(raw: any, issues: ParseIssue[]): any {
    const address = this.parseAddress(raw);
    if (!address.city || !address.state) {
      issues.push({ field: 'location', issue: 'Missing city or state', severity: 'medium' });
    }
    
    const coordinates = this.parseCoordinates(raw);
    const neighborhood = raw.neighborhood || raw.subdivision || raw.area || raw.address?.neighborhood;
    const schools = this.parseSchools(raw);
    
    return {
      address,
      coordinates,
      neighborhood,
      subdivision: raw.subdivision || raw.details?.subdivision,
      school_district: raw.schoolDistrict || raw.school_district || raw.details?.schoolDistrict,
      schools,
      township: raw.township || raw.details?.township,
      area: raw.area || raw.details?.area,
      cross_streets: raw.crossStreets || raw.cross_streets || raw.details?.crossStreets
    };
  }
  
  /**
   * Parse address components
   */
  private parseAddress(raw: any): any {
    // Handle object-style address
    if (raw.address && typeof raw.address === 'object') {
      return {
        street_number: raw.address.streetNumber || raw.address.street_number,
        street_name: raw.address.streetName || raw.address.street_name,
        street_suffix: raw.address.streetSuffix || raw.address.street_suffix,
        unit: raw.address.unit || raw.address.unitNumber,
        city: raw.address.city || raw.city || 'Unknown',
        state: raw.address.state || raw.state || 'Unknown',
        zip: raw.address.zip || raw.address.zipCode || raw.zip_code || raw.zipCode,
        county: raw.address.county || raw.county,
        country: raw.address.country || 'USA'
      };
    }
    
    // Handle string address
    return {
      street_number: raw.streetNumber,
      street_name: raw.streetName,
      street_suffix: raw.streetSuffix,
      unit: raw.unit,
      city: raw.city || 'Unknown',
      state: raw.state || 'Unknown', 
      zip: raw.zip || raw.zipCode || raw.zip_code,
      county: raw.county,
      country: 'USA'
    };
  }
  
  /**
   * Parse GPS coordinates
   */
  private parseCoordinates(raw: any): any {
    const lat = raw.latitude || raw.lat || raw.coordinates?.lat || raw.location?.lat;
    const lng = raw.longitude || raw.lng || raw.lon || raw.coordinates?.lng || raw.location?.lng;
    
    if (lat && lng) {
      return {
        latitude: parseFloat(lat),
        longitude: parseFloat(lng)
      };
    }
    
    return undefined;
  }
  
  /**
   * Parse school information
   */
  private parseSchools(raw: any): any {
    return {
      elementary: raw.elementarySchool || raw.elementary_school || raw.schools?.elementary,
      middle: raw.middleSchool || raw.middle_school || raw.schools?.middle,
      high: raw.highSchool || raw.high_school || raw.schools?.high
    };
  }
  
  /**
   * Parse detailed property information
   */
  private parsePropertyDetails(raw: any, issues: ParseIssue[]): any {
    const details = raw.details || {};
    
    const sqft = this.parseSquareFeet(raw);
    if (!sqft) {
      issues.push({ field: 'square_feet', issue: 'Missing square footage', severity: 'low' });
    }
    
    return {
      type: this.parsePropertyType(raw),
      subtype: details.propertySubType || raw.propertySubType,
      style: details.architecturalStyle || details.style || raw.style,
      bedrooms: this.parseBedrooms(raw),
      bathrooms: this.parseBathrooms(raw),
      half_baths: parseFloat(details.halfBaths || raw.halfBaths || 0),
      full_baths: parseFloat(details.fullBaths || raw.fullBaths || 0),
      total_rooms: parseInt(details.totalRooms || details.rooms || raw.totalRooms || 0),
      square_feet: sqft,
      lot_size: details.lotSize || raw.lotSize || details.lot_size,
      lot_acres: parseFloat(details.lotAcres || raw.lotAcres || 0) || undefined,
      year_built: parseInt(details.yearBuilt || raw.yearBuilt || raw.year_built || 0) || undefined,
      year_renovated: parseInt(details.yearRenovated || raw.yearRenovated || 0) || undefined,
      stories: parseInt(details.stories || raw.stories || 0) || undefined,
      garage_spaces: parseInt(details.garageSpaces || details.garage || raw.garageSpaces || 0) || undefined,
      parking_spaces: parseInt(details.parkingSpaces || raw.parkingSpaces || 0) || undefined,
      basement: details.basement || raw.basement,
      foundation: details.foundation || raw.foundation,
      roof: details.roofType || details.roof || raw.roof,
      construction: details.construction || raw.construction,
      condition: details.condition || raw.condition,
      view: details.view || raw.view,
      waterfront: details.waterfront || raw.waterfront || false
    };
  }
  
  /**
   * Parse square footage from various fields
   */
  private parseSquareFeet(raw: any): number | undefined {
    const sqft = raw.squareFeet || 
                 raw.square_feet || 
                 raw.sqft ||
                 raw.livingArea ||
                 raw.details?.sqft || 
                 raw.details?.squareFeet ||
                 raw.details?.livingAreaSqFt ||
                 raw.details?.totalSqFt;
    
    if (sqft) {
      const parsed = parseInt(sqft.toString().replace(/[^0-9]/g, ''));
      return isNaN(parsed) ? undefined : parsed;
    }
    
    return undefined;
  }
  
  /**
   * Parse ALL description fields
   */
  private parseDescriptions(raw: any, issues: ParseIssue[]): any {
    const descriptions = {
      main: raw.description || raw.publicRemarks || raw.remarks,
      remarks: raw.remarks || raw.listingRemarks,
      public_remarks: raw.publicRemarks || raw.public_remarks,
      private_remarks: raw.privateRemarks || raw.private_remarks || raw.agentRemarks,
      agent_remarks: raw.agentRemarks || raw.agent_remarks,
      features: raw.featuresDescription || raw.features_description,
      inclusions: raw.inclusions || raw.included,
      exclusions: raw.exclusions || raw.excluded,
      directions: raw.directions || raw.drivingDirections,
      showing_instructions: raw.showingInstructions || raw.showing_instructions,
      virtual_tour_remarks: raw.virtualTourRemarks || raw.virtual_tour_remarks
    };
    
    // Check if we have at least one description
    const hasDescription = Object.values(descriptions).some(d => d && d.length > 0);
    if (!hasDescription) {
      issues.push({ field: 'descriptions', issue: 'No descriptions found', severity: 'medium' });
    }
    
    return descriptions;
  }
  
  /**
   * Parse ALL feature lists
   */
  private parseFeatures(raw: any, issues: ParseIssue[]): any {
    const features: any = {
      interior: this.parseFeatureList(raw.interiorFeatures || raw.interior_features),
      exterior: this.parseFeatureList(raw.exteriorFeatures || raw.exterior_features),
      amenities: this.parseFeatureList(raw.amenities || raw.communityFeatures),
      appliances: this.parseFeatureList(raw.appliances || raw.appliancesIncluded),
      heating: this.parseFeatureList(raw.heating || raw.heatingType),
      cooling: this.parseFeatureList(raw.cooling || raw.coolingType),
      utilities: this.parseFeatureList(raw.utilities || raw.utilityFeatures),
      flooring: this.parseFeatureList(raw.flooring || raw.flooringType),
      parking: this.parseFeatureList(raw.parking || raw.parkingFeatures),
      security: this.parseFeatureList(raw.security || raw.securityFeatures),
      community: this.parseFeatureList(raw.communityFeatures || raw.community_features),
      pool: this.parseFeatureList(raw.poolFeatures || raw.pool_features),
      other: this.parseFeatureList(raw.otherFeatures || raw.additionalFeatures)
    };
    
    // Combine all unique features
    const allFeatures = new Set<string>();
    Object.values(features).forEach((list: string[]) => {
      if (Array.isArray(list)) {
        list.forEach(f => allFeatures.add(f));
      }
    });
    
    features.all = Array.from(allFeatures);
    
    if (features.all.length === 0) {
      issues.push({ field: 'features', issue: 'No features found', severity: 'low' });
    }
    
    return features;
  }
  
  /**
   * Parse feature list from various formats
   */
  private parseFeatureList(input: any): string[] {
    if (!input) return [];
    
    // Already an array
    if (Array.isArray(input)) return input;
    
    // Comma-separated string
    if (typeof input === 'string') {
      return input.split(',').map(f => f.trim()).filter(f => f.length > 0);
    }
    
    return [];
  }
  
  /**
   * Parse financial information
   */
  private parseFinancial(raw: any, issues: ParseIssue[]): any {
    const listPrice = this.parsePrice(raw);
    const sqft = this.parseSquareFeet(raw);
    
    return {
      list_price: listPrice,
      original_price: raw.originalPrice || raw.original_price,
      previous_price: raw.previousPrice || raw.previous_price,
      sold_price: raw.soldPrice || raw.sold_price,
      price_per_sqft: sqft && listPrice ? Math.round(listPrice / sqft) : undefined,
      taxes: {
        annual_amount: parseFloat(raw.taxAnnualAmount || raw.taxes || raw.annualTaxes || 0) || undefined,
        year: parseInt(raw.taxYear || raw.tax_year || 0) || undefined,
        assessment: parseFloat(raw.taxAssessment || raw.assessment || 0) || undefined,
        tax_id: raw.taxId || raw.tax_id || raw.parcelNumber
      },
      hoa: this.parseHOA(raw),
      rental: this.parseRental(raw)
    };
  }
  
  /**
   * Parse HOA information
   */
  private parseHOA(raw: any): any {
    if (!raw.hoaFee && !raw.hoa_fee && !raw.associationFee) return undefined;
    
    return {
      fee: parseFloat(raw.hoaFee || raw.hoa_fee || raw.associationFee || 0),
      frequency: raw.hoaFrequency || raw.hoa_frequency || 'monthly',
      includes: this.parseFeatureList(raw.hoaIncludes || raw.hoa_includes),
      name: raw.hoaName || raw.hoa_name || raw.associationName
    };
  }
  
  /**
   * Parse rental information
   */
  private parseRental(raw: any): any {
    if (!raw.rentPrice && !raw.monthlyRent) return undefined;
    
    return {
      monthly: parseFloat(raw.rentPrice || raw.monthlyRent || 0),
      deposit: parseFloat(raw.deposit || raw.securityDeposit || 0),
      pet_deposit: parseFloat(raw.petDeposit || raw.pet_deposit || 0),
      lease_term: raw.leaseTerm || raw.lease_term
    };
  }
  
  /**
   * Parse agent and office information
   */
  private parseListingInfo(raw: any, issues: ParseIssue[]): any {
    const agent = this.parseAgent(raw.listingAgent || raw.agent || raw);
    const office = this.parseOffice(raw.listingOffice || raw.office || raw);
    const coAgent = this.parseAgent(raw.coListingAgent || raw.co_agent);
    
    if (!agent.name) {
      issues.push({ field: 'agent', issue: 'Missing agent information', severity: 'low' });
    }
    
    return {
      agent,
      office,
      co_agent: coAgent.name ? coAgent : undefined
    };
  }
  
  /**
   * Parse agent details
   */
  private parseAgent(raw: any): any {
    if (!raw) return {};
    
    return {
      id: raw.agentId || raw.agent_id || raw.id,
      name: raw.agentName || raw.agent_name || raw.name || raw.listingAgentName,
      phone: raw.agentPhone || raw.agent_phone || raw.phone || raw.listingAgentPhone,
      mobile: raw.agentMobile || raw.agent_mobile || raw.mobile || raw.cell,
      email: raw.agentEmail || raw.agent_email || raw.email || raw.listingAgentEmail,
      license: raw.agentLicense || raw.license || raw.licenseNumber
    };
  }
  
  /**
   * Parse office details
   */
  private parseOffice(raw: any): any {
    if (!raw) return {};
    
    return {
      id: raw.officeId || raw.office_id,
      name: raw.officeName || raw.office_name || raw.brokerageName,
      phone: raw.officePhone || raw.office_phone,
      email: raw.officeEmail || raw.office_email,
      address: raw.officeAddress || raw.office_address
    };
  }
  
  /**
   * Parse all media with metadata
   */
  private parseMedia(raw: any, issues: ParseIssue[]): any {
    const photos = this.parsePhotos(raw);
    if (!photos || photos.length === 0) {
      issues.push({ field: 'photos', issue: 'No photos found', severity: 'medium' });
    }
    
    return {
      photos,
      virtual_tour: this.parseVirtualTour(raw),
      video: this.parseVideo(raw),
      floor_plans: this.parseFloorPlans(raw),
      documents: this.parseDocuments(raw)
    };
  }
  
  /**
   * Parse photos with metadata
   */
  private parsePhotos(raw: any): any[] {
    const photos: any[] = [];
    
    // Handle various photo field formats
    const photoFields = [
      raw.photos,
      raw.images,
      raw.pictures,
      raw.media?.photos,
      raw.media?.images
    ];
    
    for (const field of photoFields) {
      if (Array.isArray(field)) {
        field.forEach((photo, index) => {
          if (typeof photo === 'string') {
            photos.push({
              url: this.normalizeImageUrl(photo),
              order: index
            });
          } else if (photo && photo.url) {
            photos.push({
              url: this.normalizeImageUrl(photo.url || photo.href),
              caption: photo.caption || photo.description,
              order: photo.order ?? index,
              width: photo.width,
              height: photo.height,
              timestamp: photo.timestamp || photo.created_at
            });
          }
        });
      }
    }
    
    return photos;
  }
  
  /**
   * Normalize image URLs (handle Repliers CDN)
   */
  private normalizeImageUrl(url: string): string {
    if (!url) return '';
    
    // Already a full URL
    if (url.startsWith('http')) return url;
    
    // Repliers CDN format
    return `https://cdn.repliers.io/${url}?class=large`;
  }
  
  /**
   * Parse virtual tour information
   */
  private parseVirtualTour(raw: any): any {
    const tour = raw.virtualTour || raw.virtual_tour || raw.virtualTourUrl;
    if (!tour) return undefined;
    
    if (typeof tour === 'string') {
      return { url: tour };
    }
    
    return {
      url: tour.url || tour.href,
      type: tour.type || 'matterport',
      provider: tour.provider
    };
  }
  
  /**
   * Parse video information
   */
  private parseVideo(raw: any): any {
    const video = raw.video || raw.videoUrl || raw.video_url;
    if (!video) return undefined;
    
    if (typeof video === 'string') {
      return { url: video };
    }
    
    return {
      url: video.url || video.href,
      duration: video.duration,
      thumbnail: video.thumbnail || video.poster
    };
  }
  
  /**
   * Parse floor plans
   */
  private parseFloorPlans(raw: any): any[] {
    const plans = raw.floorPlans || raw.floor_plans || [];
    
    return plans.map((plan: any) => {
      if (typeof plan === 'string') {
        return { url: plan };
      }
      return {
        url: plan.url || plan.href,
        name: plan.name || plan.title
      };
    });
  }
  
  /**
   * Parse documents
   */
  private parseDocuments(raw: any): any[] {
    const docs = raw.documents || raw.attachments || [];
    
    return docs.map((doc: any) => ({
      url: doc.url || doc.href,
      name: doc.name || doc.title || 'Document',
      type: doc.type || doc.mimeType || 'application/pdf'
    }));
  }
  
  /**
   * Parse listing history
   */
  private parseHistory(raw: any, issues: ParseIssue[]): any {
    const listDate = this.parseDate(raw.listDate || raw.list_date || raw.listingDate);
    
    return {
      price_changes: this.parsePriceHistory(raw),
      status_changes: this.parseStatusHistory(raw),
      days_on_market: parseInt(raw.daysOnMarket || raw.dom || raw.days_on_market || 0),
      cumulative_days: parseInt(raw.cumulativeDaysOnMarket || raw.cdom || 0),
      listing_date: listDate,
      last_updated: this.parseDate(raw.lastModified || raw.modifiedDate || raw.updated_at),
      off_market_date: this.parseDate(raw.offMarketDate || raw.off_market_date),
      pending_date: this.parseDate(raw.pendingDate || raw.pending_date),
      sold_date: this.parseDate(raw.soldDate || raw.sold_date || raw.closedDate)
    };
  }
  
  /**
   * Parse date from various formats
   */
  private parseDate(input: any): Date | undefined {
    if (!input) return undefined;
    
    const date = new Date(input);
    return isNaN(date.getTime()) ? undefined : date;
  }
  
  /**
   * Parse price history
   */
  private parsePriceHistory(raw: any): any[] {
    const history = raw.priceHistory || raw.price_history || [];
    
    return history.map((entry: any) => ({
      date: this.parseDate(entry.date || entry.changeDate),
      price: parseFloat(entry.price || entry.listPrice),
      change_type: entry.type || entry.changeType || 'Price Change'
    })).filter((e: any) => e.date && e.price);
  }
  
  /**
   * Parse status history
   */
  private parseStatusHistory(raw: any): any[] {
    const history = raw.statusHistory || raw.status_history || [];
    
    return history.map((entry: any) => ({
      date: this.parseDate(entry.date || entry.changeDate),
      status: entry.status || entry.newStatus,
      previous_status: entry.previousStatus || entry.oldStatus
    })).filter((e: any) => e.date && e.status);
  }
  
  /**
   * Parse any additional fields not covered above
   */
  private parseAdditionalFields(raw: any): Record<string, any> {
    const knownFields = new Set([
      'mlsNumber', 'mls_number', 'id', 'listPrice', 'price', 'bedrooms', 'bathrooms',
      'propertyType', 'address', 'city', 'state', 'zip', 'squareFeet', 'description',
      'features', 'images', 'photos', 'agent', 'status', 'listDate'
      // Add more known fields as needed
    ]);
    
    const additional: Record<string, any> = {};
    
    // Capture any fields we haven't explicitly parsed
    Object.keys(raw).forEach(key => {
      if (!knownFields.has(key) && raw[key] !== null && raw[key] !== undefined) {
        additional[key] = raw[key];
      }
    });
    
    return additional;
  }
  
  /**
   * Calculate quality score based on data completeness
   */
  private calculateQualityScore(data: any, issues: ParseIssue[]): number {
    let score = 100;
    
    // Deduct points for missing critical fields
    const criticalFields = [
      { value: data.property.square_feet, penalty: 10 },
      { value: data.property.year_built, penalty: 5 },
      { value: data.descriptions.main, penalty: 15 },
      { value: data.media.photos?.length, penalty: 20 },
      { value: data.features.all?.length, penalty: 10 }
    ];
    
    criticalFields.forEach(field => {
      if (!field.value || (Array.isArray(field.value) && field.value.length === 0)) {
        score -= field.penalty;
      }
    });
    
    // Deduct based on issues
    issues.forEach(issue => {
      switch (issue.severity) {
        case 'high': score -= 10; break;
        case 'medium': score -= 5; break;
        case 'low': score -= 2; break;
      }
    });
    
    // Bonus points for rich data
    if (data.media.photos?.length > 10) score += 5;
    if (data.media.virtual_tour) score += 5;
    if (data.features.all?.length > 20) score += 5;
    if (data.descriptions.main?.length > 500) score += 5;
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Generate hash of parsed data for change detection
   */
  generateDataHash(parsed: ParsedListing): string {
    const significant = {
      price: parsed.price,
      status: parsed.status,
      description: parsed.data.descriptions.main,
      photos: parsed.data.media.photos?.length
    };
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(significant))
      .digest('hex');
  }
}

// Export singleton instance
export const listingParser = new ListingParser();
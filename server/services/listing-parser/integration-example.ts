/**
 * How to integrate the listing parser into your existing data flow
 */

import { listingParser } from './index';
import { db } from '../../db';

// 1. WHEN FETCHING FROM REPLIERS API
export async function processRepliersSearchResults(profileId: number) {
  // Get raw listings from Repliers API (your existing code)
  const { repliersService } = await import('../repliers-service');
  const rawListings = await repliersService.searchBroadListings(profile);
  
  // Parse each listing to capture ALL data
  const parsedListings = rawListings.map(rawListing => {
    return listingParser.parse(rawListing, 'repliers');
  });
  
  // Store in PostgreSQL
  for (const listing of parsedListings) {
    await storeParsedListing(listing);
  }
  
  return parsedListings;
}

// 2. STORING PARSED DATA IN POSTGRESQL
async function storeParsedListing(parsed: any) {
  const query = `
    INSERT INTO parsed_listings (
      mls_number, source, source_id,
      price, bedrooms, bathrooms, property_type, square_feet, year_built,
      street_address, city, state, zip_code, latitude, longitude,
      status, list_date,
      data, raw_data,
      parse_quality_score, parse_issues, parser_version
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
    ON CONFLICT (mls_number) 
    DO UPDATE SET
      data = EXCLUDED.data,
      parse_quality_score = EXCLUDED.parse_quality_score,
      updated_at = NOW()
    RETURNING id
  `;
  
  const values = [
    parsed.mls_number,
    parsed.source,
    parsed.source_id,
    parsed.price,
    parsed.bedrooms,
    parsed.bathrooms,
    parsed.property_type,
    parsed.square_feet,
    parsed.year_built,
    parsed.street_address,
    parsed.city,
    parsed.state,
    parsed.zip_code,
    parsed.latitude,
    parsed.longitude,
    parsed.status,
    parsed.list_date,
    JSON.stringify(parsed.data), // Complete data as JSONB
    JSON.stringify(parsed.raw_data), // Raw data for debugging
    parsed.parse_quality_score,
    JSON.stringify(parsed.parse_issues),
    parsed.parser_version
  ];
  
  const result = await db.query(query, values);
  return result.rows[0].id;
}

// 3. RETRIEVING LISTINGS WITH ALL DATA
export async function getListingWithFullData(mlsNumber: string) {
  const query = `
    SELECT 
      -- Core fields for display
      mls_number, price, bedrooms, bathrooms, 
      street_address, city, state,
      -- Full parsed data
      data,
      -- Quality info
      parse_quality_score
    FROM parsed_listings
    WHERE mls_number = $1
  `;
  
  const result = await db.query(query, [mlsNumber]);
  if (result.rows.length === 0) return null;
  
  const listing = result.rows[0];
  
  // Access ALL data including descriptions
  return {
    // Basic info
    mls_number: listing.mls_number,
    price: listing.price,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    address: listing.street_address,
    city: listing.city,
    state: listing.state,
    
    // Full descriptions (what was missing!)
    description: listing.data.descriptions.main,
    public_remarks: listing.data.descriptions.public_remarks,
    directions: listing.data.descriptions.directions,
    
    // All features
    features: listing.data.features.all,
    interior_features: listing.data.features.interior,
    exterior_features: listing.data.features.exterior,
    
    // Agent info
    agent: listing.data.listing_info.agent,
    
    // Media with metadata
    photos: listing.data.media.photos,
    virtual_tour: listing.data.media.virtual_tour,
    
    // Financial details
    taxes: listing.data.financial.taxes,
    hoa: listing.data.financial.hoa,
    
    // And much more...
    full_data: listing.data
  };
}

// 4. SEARCH WITH RICH FILTERS
export async function searchListingsWithFeatures(filters: {
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  features?: string[];
  hasVirtualTour?: boolean;
  minQualityScore?: number;
}) {
  let query = `
    SELECT *
    FROM parsed_listings
    WHERE status = 'active'
  `;
  
  const params: any[] = [];
  let paramCount = 1;
  
  if (filters.city) {
    query += ` AND city ILIKE $${paramCount++}`;
    params.push(`%${filters.city}%`);
  }
  
  if (filters.minPrice) {
    query += ` AND price >= $${paramCount++}`;
    params.push(filters.minPrice);
  }
  
  if (filters.maxPrice) {
    query += ` AND price <= $${paramCount++}`;
    params.push(filters.maxPrice);
  }
  
  // Search within JSONB data
  if (filters.features && filters.features.length > 0) {
    query += ` AND data->'features'->'all' ?| $${paramCount++}`;
    params.push(filters.features);
  }
  
  if (filters.hasVirtualTour) {
    query += ` AND data->'media'->'virtual_tour' IS NOT NULL`;
  }
  
  if (filters.minQualityScore) {
    query += ` AND parse_quality_score >= $${paramCount++}`;
    params.push(filters.minQualityScore);
  }
  
  query += ` ORDER BY list_date DESC LIMIT 50`;
  
  const result = await db.query(query, params);
  return result.rows;
}

// 5. UPDATE CLIENT DASHBOARD TO SHOW DESCRIPTIONS
export async function getListingForClientDisplay(mlsNumber: string) {
  const listing = await getListingWithFullData(mlsNumber);
  if (!listing) return null;
  
  return {
    // Everything the client sees now
    ...listing,
    
    // Plus all the new data we're capturing
    description: listing.description || listing.public_remarks || 'No description available',
    
    // Feature highlights for display
    feature_highlights: [
      ...(listing.interior_features || []).slice(0, 3),
      ...(listing.exterior_features || []).slice(0, 2)
    ],
    
    // Rich media
    photo_count: listing.photos?.length || 0,
    has_virtual_tour: !!listing.virtual_tour,
    
    // Additional context
    neighborhood: listing.full_data.location.neighborhood,
    schools: listing.full_data.location.schools,
    
    // Financial summary  
    monthly_payment_estimate: calculateMonthlyPayment(listing.price),
    total_monthly_with_hoa: listing.hoa ? 
      calculateMonthlyPayment(listing.price) + listing.hoa.fee : 
      calculateMonthlyPayment(listing.price)
  };
}

function calculateMonthlyPayment(price: number): number {
  // Simple mortgage calculation (30 year, 7% interest)
  const principal = price * 0.8; // 20% down
  const rate = 0.07 / 12;
  const months = 360;
  return Math.round(principal * (rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1));
}
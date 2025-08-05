/**
 * Updated listings route to use the comprehensive parser
 */

import { Router } from 'express';
import { listingParser } from '../services/listing-parser';
import { db } from '../db';

const router = Router();

// Enhanced search endpoint that returns parsed data with descriptions
router.post('/api/listings/search', async (req, res) => {
  try {
    const { profileId } = req.body;
    
    // 1. Get profile
    const profileResult = await db.query(
      'SELECT * FROM buyer_profiles WHERE id = $1',
      [profileId]
    );
    const profile = profileResult.rows[0];
    
    // 2. Search listings using existing service
    const { repliersService } = await import('../services/repliers-service');
    const rawListings = await repliersService.searchBroadListings(profile);
    
    // 3. Parse ALL data from each listing
    const parsedListings = await Promise.all(
      rawListings.map(async (rawListing) => {
        const parsed = listingParser.parse(rawListing, 'repliers');
        
        // Store in database
        await storeParsedListing(parsed);
        
        return parsed;
      })
    );
    
    // 4. Score and rank listings (your existing logic)
    const { hybridSearchService } = await import('../services/hybrid-search-service');
    const scoredListings = await hybridSearchService.scoreAndRankListings(
      parsedListings.map(p => ({
        ...p,
        // Ensure compatibility with existing scoring
        description: p.data.descriptions.main,
        features: p.data.features.all
      })),
      profile
    );
    
    // 5. Return enriched results
    const enrichedResults = {
      top_picks: scoredListings.top_picks.map(enrichListing),
      other_matches: scoredListings.other_matches.map(enrichListing),
      search_summary: {
        ...scoredListings.search_summary,
        data_quality: {
          avg_quality_score: calculateAvgQuality(parsedListings),
          listings_with_descriptions: parsedListings.filter(p => p.data.descriptions.main).length,
          listings_with_photos: parsedListings.filter(p => p.data.media.photos?.length > 0).length
        }
      }
    };
    
    res.json(enrichedResults);
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get single listing with ALL data
router.get('/api/listings/:mlsNumber', async (req, res) => {
  try {
    const { mlsNumber } = req.params;
    
    const result = await db.query(
      'SELECT * FROM parsed_listings WHERE mls_number = $1',
      [mlsNumber]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    
    const listing = result.rows[0];
    
    // Return full enriched data
    res.json({
      // Core fields
      mls_number: listing.mls_number,
      price: listing.price,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      address: listing.street_address,
      city: listing.city,
      state: listing.state,
      
      // All parsed data
      ...listing.data,
      
      // Quality info
      data_quality: {
        score: listing.parse_quality_score,
        issues: listing.parse_issues,
        last_updated: listing.updated_at
      }
    });
    
  } catch (error) {
    console.error('Get listing error:', error);
    res.status(500).json({ error: 'Failed to get listing' });
  }
});

// Helper functions
function enrichListing(scoredListing: any) {
  const listing = scoredListing.listing;
  
  return {
    listing: {
      // Existing fields
      id: listing.id,
      price: listing.price,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      property_type: listing.property_type,
      address: listing.street_address || listing.address,
      city: listing.city,
      state: listing.state,
      zip_code: listing.zip_code,
      
      // NEW: All descriptions
      description: listing.data?.descriptions?.main,
      public_remarks: listing.data?.descriptions?.public_remarks,
      showing_instructions: listing.data?.descriptions?.showing_instructions,
      
      // NEW: Comprehensive features
      features: listing.data?.features?.all || [],
      interior_features: listing.data?.features?.interior || [],
      exterior_features: listing.data?.features?.exterior || [],
      
      // NEW: Rich media
      images: listing.data?.media?.photos?.map(p => p.url) || listing.images || [],
      virtual_tour_url: listing.data?.media?.virtual_tour?.url,
      
      // NEW: Financial details
      taxes_annual: listing.data?.financial?.taxes?.annual_amount,
      hoa_fee: listing.data?.financial?.hoa?.fee,
      price_per_sqft: listing.data?.financial?.price_per_sqft,
      
      // NEW: Agent info
      listing_agent: listing.data?.listing_info?.agent,
      
      // Quality indicator
      data_completeness: listing.parse_quality_score || 0
    },
    match_score: scoredListing.match_score,
    label: scoredListing.label,
    matched_features: scoredListing.matched_features,
    reason: scoredListing.reason,
    score_breakdown: scoredListing.score_breakdown
  };
}

function calculateAvgQuality(listings: any[]): number {
  if (listings.length === 0) return 0;
  const sum = listings.reduce((acc, l) => acc + (l.parse_quality_score || 0), 0);
  return Math.round(sum / listings.length);
}

async function storeParsedListing(parsed: any) {
  const query = `
    INSERT INTO parsed_listings (
      mls_number, source, source_id,
      price, bedrooms, bathrooms, property_type, square_feet, year_built,
      street_address, city, state, zip_code, latitude, longitude,
      status, list_date,
      data, parse_quality_score, parse_issues, parser_version
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    ON CONFLICT (mls_number) 
    DO UPDATE SET
      data = EXCLUDED.data,
      parse_quality_score = EXCLUDED.parse_quality_score,
      updated_at = NOW()
  `;
  
  await db.query(query, [
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
    JSON.stringify(parsed.data),
    parsed.parse_quality_score,
    JSON.stringify(parsed.parse_issues),
    parsed.parser_version
  ]);
}

export default router;
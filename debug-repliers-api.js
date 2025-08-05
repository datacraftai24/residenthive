/**
 * Debug script to call Repliers API directly and save raw response
 * This helps us understand the exact data structure we're receiving
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function debugRepliersAPI() {
  console.log('🔍 Debug Repliers API Response\n');
  
  const apiKey = process.env.REPLIERS_API_KEY;
  if (!apiKey) {
    console.error('❌ REPLIERS_API_KEY not found in .env file');
    return;
  }
  
  // Test parameters (from your console log)
  const searchUrl = 'https://api.repliers.io/listings?type=sale&city=Quincy&state=MA&maxPrice=800000&minBeds=2&minGarageSpaces=1';
  
  console.log('📡 Calling Repliers API...');
  console.log('URL:', searchUrl);
  console.log('Method: POST (will fallback to GET if needed)\n');
  
  try {
    // Try POST first (as shown in logs)
    let response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'REPLIERS-API-KEY': apiKey,
        'accept': 'application/json',
        'content-type': 'application/json'
      }
    });
    
    // If POST fails, try GET (as shown in logs)
    if (!response.ok) {
      console.log('⚠️ POST failed, trying GET...');
      response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'REPLIERS-API-KEY': apiKey,
          'accept': 'application/json'
        }
      });
    }
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log('✅ API Response received!');
    console.log(`Total listings: ${data.listings?.length || 0}`);
    
    // Save full response
    await fs.writeFile(
      'repliers-raw-response.json',
      JSON.stringify(data, null, 2)
    );
    console.log('\n💾 Full response saved to: repliers-raw-response.json');
    
    // Analyze first listing structure
    if (data.listings && data.listings.length > 0) {
      const firstListing = data.listings[0];
      
      console.log('\n📊 First Listing Structure:');
      console.log('=========================');
      
      // Check for ID fields
      console.log('\n🆔 ID Fields:');
      console.log('  id:', firstListing.id || 'MISSING');
      console.log('  mlsNumber:', firstListing.mlsNumber || 'MISSING');
      console.log('  listingId:', firstListing.listingId || 'MISSING');
      console.log('  _id:', firstListing._id || 'MISSING');
      
      // Check for basic fields
      console.log('\n🏠 Basic Fields:');
      console.log('  listPrice:', firstListing.listPrice);
      console.log('  bedrooms:', firstListing.bedrooms);
      console.log('  bathrooms:', firstListing.bathrooms, `(type: ${typeof firstListing.bathrooms})`);
      
      // Check for details object
      if (firstListing.details) {
        console.log('\n📋 Details Object:');
        console.log('  numBedrooms:', firstListing.details.numBedrooms);
        console.log('  numBathrooms:', firstListing.details.numBathrooms, `(type: ${typeof firstListing.details.numBathrooms})`);
        console.log('  halfBaths:', firstListing.details.halfBaths);
        console.log('  fullBaths:', firstListing.details.fullBaths);
      }
      
      // Check for address
      console.log('\n📍 Address:');
      console.log('  Type:', typeof firstListing.address);
      if (typeof firstListing.address === 'object') {
        console.log('  Structure:', Object.keys(firstListing.address).join(', '));
      }
      
      // Check for descriptions
      console.log('\n📝 Description Fields:');
      console.log('  description:', firstListing.description ? 'Present' : 'MISSING');
      console.log('  publicRemarks:', firstListing.publicRemarks ? 'Present' : 'MISSING');
      console.log('  remarks:', firstListing.remarks ? 'Present' : 'MISSING');
      
      // Save first listing separately for testing
      await fs.writeFile(
        'repliers-first-listing.json',
        JSON.stringify(firstListing, null, 2)
      );
      console.log('\n💾 First listing saved to: repliers-first-listing.json');
      
      // Test parsing with our parser
      console.log('\n🧪 Testing Parser...');
      try {
        const { listingParser } = await import('./server/services/listing-parser/index.js');
        const parsed = listingParser.parse(firstListing, 'repliers');
        
        console.log('\n✅ Parser Results:');
        console.log('  ID:', parsed.id);
        console.log('  MLS:', parsed.mls_number);
        console.log('  Bathrooms:', parsed.bathrooms, `(from ${firstListing.bathrooms || firstListing.details?.numBathrooms})`);
        console.log('  Description:', parsed.data.descriptions.main ? 'Captured' : 'Missing');
        console.log('  Quality Score:', parsed.parse_quality_score);
        
        // Save parsed result
        await fs.writeFile(
          'repliers-parsed-listing.json',
          JSON.stringify(parsed, null, 2)
        );
        console.log('\n💾 Parsed listing saved to: repliers-parsed-listing.json');
        
      } catch (parseError) {
        console.error('❌ Parser error:', parseError.message);
      }
    }
    
  } catch (error) {
    console.error('❌ API Error:', error.message);
  }
}

// Run the debug script
debugRepliersAPI();
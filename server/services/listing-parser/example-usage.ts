/**
 * Example usage of the comprehensive listing parser
 * Shows how it captures ALL data fields including descriptions
 */

import { listingParser } from './index';

// Example raw listing from Repliers API with all possible fields
const exampleRawListing = {
  // Basic fields
  mlsNumber: "MLS123456",
  listPrice: 450000,
  bedrooms: 3,
  bathrooms: "2.5",
  propertyType: "Single Family",
  
  // Address object format (as returned by Repliers)
  address: {
    streetNumber: "123",
    streetName: "Main",
    streetSuffix: "Street", 
    city: "Quincy",
    state: "MA",
    zip: "02169",
    county: "Norfolk",
    neighborhood: "Marina Bay"
  },
  
  // Detailed property info
  details: {
    numBedrooms: 3,
    numBathrooms: 2,
    halfBaths: 1,
    squareFeet: 2200,
    lotSize: "0.25 acres",
    yearBuilt: 2005,
    garage: 2,
    basement: "Finished",
    stories: 2,
    propertySubType: "Colonial"
  },
  
  // ALL descriptions (what was missing before!)
  description: "Beautiful colonial home in desirable Marina Bay neighborhood. This stunning property features an open concept living area with hardwood floors throughout the first floor.",
  publicRemarks: "Move-in ready home with recent updates including new kitchen appliances and fresh paint. Great location near schools and shopping.",
  privateRemarks: "Motivated seller. Home inspection already completed. Flexible closing date.",
  agentRemarks: "Show with confidence. Easy to show, lockbox on front door. Call listing agent with any questions.",
  directions: "From I-93, take exit 7 to Quincy. Right on Main St, house on left.",
  showingInstructions: "Call 24 hours in advance. No showings during dinnertime 5-7pm.",
  virtualTourRemarks: "3D tour showcases the spacious layout and recent renovations.",
  
  // Features (comprehensive lists)
  interiorFeatures: ["Hardwood Floors", "Crown Molding", "Granite Counters", "Stainless Appliances", "Master Suite", "Walk-in Closets"],
  exteriorFeatures: ["Deck", "Patio", "Fenced Yard", "Sprinkler System", "Shed"],
  amenities: ["Central Air", "Central Heat", "Cable Ready", "High Speed Internet"],
  appliances: ["Refrigerator", "Dishwasher", "Microwave", "Washer", "Dryer", "Garbage Disposal"],
  heatingType: ["Forced Air", "Natural Gas"],
  coolingType: ["Central Air"],
  
  // Financial details
  taxAnnualAmount: 5400,
  taxYear: 2023,
  hoaFee: 150,
  hoaFrequency: "monthly",
  hoaIncludes: "Landscaping,Snow Removal,Trash",
  
  // Agent/Office info
  listingAgent: {
    name: "Jane Smith",
    phone: "617-555-1234",
    email: "jane@realestate.com",
    license: "RE123456"
  },
  listingOffice: {
    name: "ABC Realty",
    phone: "617-555-5678",
    email: "info@abcrealty.com"
  },
  
  // Media with metadata
  images: [
    "listing/123456/photo1.jpg",
    "listing/123456/photo2.jpg", 
    "listing/123456/photo3.jpg"
  ],
  virtualTour: {
    url: "https://my.matterport.com/show/?m=abc123",
    type: "matterport"
  },
  
  // History
  listDate: "2024-01-15",
  daysOnMarket: 45,
  priceHistory: [
    { date: "2024-01-15", price: 475000, type: "Listed" },
    { date: "2024-02-01", price: 450000, type: "Price Reduced" }
  ],
  
  // Additional fields that might exist
  waterfront: true,
  view: "Water",
  schoolDistrict: "Quincy Public Schools",
  elementarySchool: "Lincoln Elementary",
  middleSchool: "Quincy Middle",
  highSchool: "Quincy High"
};

// Parse the listing
console.log("🔍 Parsing comprehensive listing data...\n");
const parsed = listingParser.parse(exampleRawListing, 'repliers');

// Show what was captured
console.log("✅ CAPTURED DATA SUMMARY:");
console.log("========================\n");

// Core fields
console.log("📍 LOCATION:");
console.log(`  Address: ${parsed.street_address}`);
console.log(`  City: ${parsed.city}, ${parsed.state} ${parsed.zip_code}`);
console.log(`  Neighborhood: ${parsed.data.location.neighborhood || 'N/A'}`);

// Property details
console.log("\n🏠 PROPERTY:");
console.log(`  Type: ${parsed.property_type}`);
console.log(`  Price: $${parsed.price.toLocaleString()}`);
console.log(`  Beds/Baths: ${parsed.bedrooms} beds, ${parsed.bathrooms} baths`);
console.log(`  Square Feet: ${parsed.square_feet?.toLocaleString() || 'N/A'}`);
console.log(`  Year Built: ${parsed.year_built || 'N/A'}`);

// ALL Descriptions
console.log("\n📝 DESCRIPTIONS (ALL CAPTURED!):");
const descs = parsed.data.descriptions;
console.log(`  Main: ${descs.main ? descs.main.substring(0, 100) + '...' : 'None'}`);
console.log(`  Public Remarks: ${descs.public_remarks ? 'Yes (' + descs.public_remarks.length + ' chars)' : 'None'}`);
console.log(`  Private Remarks: ${descs.private_remarks ? 'Yes' : 'None'}`);
console.log(`  Agent Remarks: ${descs.agent_remarks ? 'Yes' : 'None'}`);
console.log(`  Directions: ${descs.directions ? 'Yes' : 'None'}`);
console.log(`  Showing Instructions: ${descs.showing_instructions ? 'Yes' : 'None'}`);

// Features
console.log("\n✨ FEATURES:");
console.log(`  Interior: ${parsed.data.features.interior?.length || 0} features`);
console.log(`  Exterior: ${parsed.data.features.exterior?.length || 0} features`);
console.log(`  Amenities: ${parsed.data.features.amenities?.length || 0} features`);
console.log(`  Total Unique: ${parsed.data.features.all?.length || 0} features`);

// Financial
console.log("\n💰 FINANCIAL:");
console.log(`  List Price: $${parsed.data.financial.list_price.toLocaleString()}`);
console.log(`  Price/SqFt: $${parsed.data.financial.price_per_sqft || 'N/A'}`);
console.log(`  Annual Taxes: $${parsed.data.financial.taxes?.annual_amount?.toLocaleString() || 'N/A'}`);
console.log(`  HOA: ${parsed.data.financial.hoa ? '$' + parsed.data.financial.hoa.fee + '/' + parsed.data.financial.hoa.frequency : 'None'}`);

// Media
console.log("\n📸 MEDIA:");
console.log(`  Photos: ${parsed.data.media.photos?.length || 0} images`);
console.log(`  Virtual Tour: ${parsed.data.media.virtual_tour ? 'Yes (' + parsed.data.media.virtual_tour.type + ')' : 'None'}`);

// Quality Score
console.log("\n📊 QUALITY:");
console.log(`  Parse Score: ${parsed.parse_quality_score}/100`);
console.log(`  Issues Found: ${parsed.parse_issues.length}`);
if (parsed.parse_issues.length > 0) {
  parsed.parse_issues.forEach(issue => {
    console.log(`    - ${issue.field}: ${issue.issue} (${issue.severity})`);
  });
}

// Show full JSON structure
console.log("\n🔧 FULL PARSED STRUCTURE:");
console.log(JSON.stringify(parsed, null, 2));

// Show what would be stored in PostgreSQL
console.log("\n💾 POSTGRESQL STORAGE:");
console.log("Structured fields (for indexing):");
console.log({
  mls_number: parsed.mls_number,
  price: parsed.price,
  bedrooms: parsed.bedrooms,
  bathrooms: parsed.bathrooms,
  city: parsed.city,
  state: parsed.state
});
console.log("\nJSONB data field (complete data):");
console.log("Size:", JSON.stringify(parsed.data).length, "bytes");
console.log("Contains:", Object.keys(parsed.data).join(', '));
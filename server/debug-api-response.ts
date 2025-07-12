import { repliersAPI } from './repliers-api';

/**
 * Debug script to inspect raw Repliers API response structure
 */
async function debugAPIResponse() {
  try {
    console.log('🔍 Testing Repliers API response structure...');
    
    const testProfile = {
      name: "Debug Test",
      bedrooms: 2,
      bathrooms: "1+",
      preferredAreas: ["Austin"]
    };

    // Get raw response by temporarily modifying the API to log data
    const listings = await repliersAPI.searchListings(testProfile);
    
    if (listings && listings.length > 0) {
      console.log('\n📋 Sample listing structure:');
      const sample = listings[0];
      console.log('ID:', sample.id);
      console.log('Price:', sample.price);
      console.log('Bedrooms:', sample.bedrooms);
      console.log('Bathrooms:', sample.bathrooms);
      console.log('Property Type:', sample.property_type);
      console.log('Address:', sample.address);
      console.log('City:', sample.city);
      console.log('Images count:', sample.images?.length || 0);
      
      console.log('\n📊 Bedroom/Bathroom summary for first 10 listings:');
      listings.slice(0, 10).forEach((listing, i) => {
        console.log(`${i + 1}. ${listing.id}: ${listing.bedrooms}BR/${listing.bathrooms}BA - $${listing.price.toLocaleString()}`);
      });
      
    } else {
      console.log('❌ No listings returned');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  debugAPIResponse();
}

export { debugAPIResponse };
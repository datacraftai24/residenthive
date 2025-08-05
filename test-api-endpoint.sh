#!/bin/bash

# Test script for the listing search API endpoint
# This tests if the parser integration is working correctly

echo "🧪 Testing Listing Search API with Parser Integration"
echo "=================================================="
echo ""

# Replace with an actual profile ID from your database
PROFILE_ID=1
API_URL="http://localhost:5001/api/listings/search?profileId=$PROFILE_ID"

echo "📡 Calling: GET $API_URL"
echo ""

# Make the API call and save response
response=$(curl -s -X GET "$API_URL")

# Check if curl succeeded
if [ $? -ne 0 ]; then
    echo "❌ Failed to connect to API. Is your server running?"
    exit 1
fi

# Pretty print the response using node
echo "$response" | node -e "
const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));

console.log('✅ Response received!');
console.log('');
console.log('📊 Search Summary:');
console.log('  Total found:', data.search_summary?.total_found || 0);
console.log('  Top picks:', data.top_picks?.length || 0);
console.log('  Other matches:', data.other_matches?.length || 0);
console.log('');

if (data.top_picks && data.top_picks.length > 0) {
    const firstListing = data.top_picks[0].listing;
    
    console.log('🏠 First Top Pick Details:');
    console.log('  Address:', firstListing.address + ', ' + firstListing.city + ', ' + firstListing.state);
    console.log('  Price: $' + (firstListing.price || 0).toLocaleString());
    console.log('  Beds/Baths:', firstListing.bedrooms + '/' + firstListing.bathrooms);
    console.log('');
    
    console.log('📝 NEW PARSED DATA CHECK:');
    console.log('  ✓ Description:', firstListing.description ? 'YES (' + firstListing.description.length + ' chars)' : '❌ MISSING');
    console.log('  ✓ Public Remarks:', firstListing.public_remarks ? 'YES' : '❌ MISSING');
    console.log('  ✓ Square Feet:', firstListing.square_feet || '❌ MISSING');
    console.log('  ✓ Features:', (firstListing.features?.length || 0) + ' items');
    console.log('  ✓ Interior Features:', (firstListing.interior_features?.length || 0) + ' items');
    console.log('  ✓ Annual Taxes:', firstListing.taxes_annual ? '$' + firstListing.taxes_annual.toLocaleString() : 'Not provided');
    console.log('  ✓ HOA Fee:', firstListing.hoa_fee ? '$' + firstListing.hoa_fee + '/mo' : 'Not provided');
    console.log('  ✓ Data Quality Score:', firstListing.data_quality_score || 'Not provided');
    console.log('');
    
    if (firstListing.description) {
        console.log('📄 Description Preview:');
        console.log('  \"' + firstListing.description.substring(0, 100) + '...\"');
    } else {
        console.log('⚠️  No description found - parser may not be working correctly!');
    }
} else {
    console.log('⚠️  No listings found. Try with a different profile ID.');
}
"

echo ""
echo "💡 To test with a different profile:"
echo "   ./test-api-endpoint.sh <profile_id>"
echo ""
echo "📌 Check the client dashboard to see if descriptions are displayed!"
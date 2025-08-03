#!/usr/bin/env node

// Simple test script for Repliers NLP API
// Usage: node test-nlp.js

const profileData = {
  name: "Piyush Tiwari",
  budgetMin: 500000,
  budgetMax: 800000,
  homeType: "single-family",
  bedrooms: 3,
  bathrooms: "1+",
  preferredAreas: ["Quincy, Massachusetts"],
  mustHaveFeatures: ["car garage", "modern kitchen"],
  specialNeeds: ["family-focused"]
};

function createNLPPrompt(profile) {
  const components = [];
  
  if (profile.budgetMin && profile.budgetMax) {
    components.push(`budget between $${profile.budgetMin.toLocaleString()} and $${profile.budgetMax.toLocaleString()}`);
  }
  
  if (profile.homeType && profile.bedrooms) {
    components.push(`${profile.bedrooms}-bedroom ${profile.homeType} home`);
  }
  
  if (profile.bathrooms) {
    components.push(`at least ${profile.bathrooms} bathroom`);
  }
  
  if (profile.preferredAreas && profile.preferredAreas.length > 0) {
    components.push(`in ${profile.preferredAreas.join(' or ')}`);
  }
  
  if (profile.mustHaveFeatures && profile.mustHaveFeatures.length > 0) {
    components.push(`with ${profile.mustHaveFeatures.join(', ')}`);
  }
  
  if (profile.specialNeeds && profile.specialNeeds.length > 0) {
    components.push(`suitable for ${profile.specialNeeds.join(', ')}`);
  }
  
  return `Find a ${components.join(' ')}`;
}

async function testNLPAPI() {
  const prompt = createNLPPrompt(profileData);
  
  console.log('Testing Repliers NLP API');
  console.log('Profile:', profileData.name);
  console.log('NLP Prompt:', prompt);
  console.log('');
  
  try {
    const response = await fetch('https://api.repliers.io/nlp', {
      method: 'POST',
      headers: {
        'REPLIERS-API-KEY': 'lwSqnPJBTbOq2hBMj26lwFqBR4yfit',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt })
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.log('❌ API Error:', JSON.stringify(result, null, 2));
      return;
    }

    console.log('✅ Success! NLP API Response:');
    console.log(JSON.stringify(result, null, 2));
    
    // If we get a search URL, test it
    if (result.search_url || result.url) {
      const searchUrl = result.search_url || result.url;
      console.log('');
      console.log('🔗 Ready-to-use search URL:', searchUrl);
      
      // Optionally test the search URL
      console.log('');
      console.log('🚀 Testing the generated search URL...');
      const searchResponse = await fetch(searchUrl, {
        headers: {
          'REPLIERS-API-KEY': process.env.REPLIERS_API_KEY
        }
      });
      
      if (searchResponse.ok) {
        const listings = await searchResponse.json();
        console.log(`✅ Search successful! Found ${listings.length} listings`);
        if (listings.length > 0) {
          console.log('📋 First listing:', {
            address: listings[0].address,
            price: listings[0].price,
            bedrooms: listings[0].bedrooms,
            bathrooms: listings[0].bathrooms
          });
        }
      } else {
        console.log('❌ Search URL test failed:', searchResponse.status);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Check if REPLIERS_API_KEY is set
if (!process.env.REPLIERS_API_KEY) {
  console.error('❌ REPLIERS_API_KEY environment variable not set');
  process.exit(1);
}

testNLPAPI();
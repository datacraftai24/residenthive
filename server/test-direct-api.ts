// Test direct API connection with new key
import 'dotenv/config';

async function testDirectAPI() {
  const apiKey = process.env.REPLIERS_API_KEY;
  
  console.log('API Key Status:', apiKey ? '[PRESENT]' : '[MISSING]');
  console.log('API Key Length:', apiKey ? apiKey.length : 0);
  
  if (!apiKey) {
    console.error('No API key found');
    return;
  }

  try {
    console.log('Testing basic API connection...');
    const response = await fetch('https://api.repliers.io/listings?limit=1', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('Response Status:', response.status);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.json();
    console.log('Response Data:', JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('API Test Error:', error);
  }
}

testDirectAPI();
// Test script to verify Repliers aggregates endpoint
import 'dotenv/config';

async function testAggregates() {
  const apiKey = process.env.REPLIERS_API_KEY;
  
  if (!apiKey) {
    console.error('REPLIERS_API_KEY not found');
    return;
  }

  try {
    console.log('Testing Property Type Aggregates...');
    const propertyTypeResponse = await fetch('https://api.repliers.io/listings?aggregates=details.propertyType', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const propertyTypeData = await propertyTypeResponse.json();
    console.log('Property Types:', JSON.stringify(propertyTypeData, null, 2));

    console.log('\nTesting Style Aggregates...');
    const styleResponse = await fetch('https://api.repliers.io/listings?aggregates=details.style', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const styleData = await styleResponse.json();
    console.log('Styles:', JSON.stringify(styleData, null, 2));

    // Extract multi-family properties
    const styles = styleData.aggregates?.details?.style || {};
    const multiFamilyStyles = Object.entries(styles)
      .filter(([key]) => key.toLowerCase().includes('family') || key.toLowerCase().includes('duplex'))
      .sort((a, b) => (b[1] as number) - (a[1] as number));

    console.log('\nMulti-Family Investment Properties Available:');
    multiFamilyStyles.forEach(([style, count]) => {
      console.log(`${style}: ${count} listings`);
    });

  } catch (error) {
    console.error('Error testing aggregates:', error);
  }
}

testAggregates();
import { db } from './db';
import { repliersListings, type InsertRepliersListing } from '../shared/schema';

/**
 * Generate realistic test listings for development and testing
 * Creates 200 diverse property listings with authentic-looking data
 */
class TestListingGenerator {
  
  private cities = [
    { city: 'Austin', state: 'TX', avgPrice: 450000, priceRange: 0.4 },
    { city: 'Dallas', state: 'TX', avgPrice: 380000, priceRange: 0.5 },
    { city: 'Houston', state: 'TX', avgPrice: 350000, priceRange: 0.6 },
    { city: 'Los Angeles', state: 'CA', avgPrice: 750000, priceRange: 0.7 },
    { city: 'San Diego', state: 'CA', avgPrice: 680000, priceRange: 0.6 },
    { city: 'Miami', state: 'FL', avgPrice: 520000, priceRange: 0.8 },
    { city: 'Orlando', state: 'FL', avgPrice: 320000, priceRange: 0.5 },
    { city: 'Phoenix', state: 'AZ', avgPrice: 420000, priceRange: 0.4 },
    { city: 'Denver', state: 'CO', avgPrice: 550000, priceRange: 0.5 },
    { city: 'Atlanta', state: 'GA', avgPrice: 380000, priceRange: 0.6 },
  ];

  private propertyTypes = ['Single Family', 'Townhouse', 'Condo', 'Duplex'];
  
  private streetNames = [
    'Oak Street', 'Maple Avenue', 'Pine Road', 'Cedar Lane', 'Elm Drive',
    'Main Street', 'Park Avenue', 'First Street', 'Second Avenue', 'Third Street',
    'Highland Drive', 'Sunset Boulevard', 'River Road', 'Hill Street', 'Valley Lane',
    'Garden Way', 'Forest Avenue', 'Lake Street', 'Mountain View', 'Meadow Lane'
  ];

  private features = [
    'Hardwood Floors', 'Updated Kitchen', 'Granite Countertops', 'Stainless Steel Appliances',
    'Fireplace', 'Walk-in Closet', 'Master Suite', 'Garage', 'Backyard',
    'Swimming Pool', 'Hot Tub', 'Patio', 'Deck', 'Basement', 'Attic',
    'Central Air', 'Heating System', 'Dishwasher', 'Washer/Dryer', 'Storage'
  ];

  /**
   * Generate specified number of realistic test listings
   */
  async generateTestListings(count = 200): Promise<void> {
    console.log(`🏠 Generating ${count} realistic test listings...`);

    const listings: InsertRepliersListing[] = [];

    for (let i = 0; i < count; i++) {
      const city = this.cities[Math.floor(Math.random() * this.cities.length)];
      const propertyType = this.propertyTypes[Math.floor(Math.random() * this.propertyTypes.length)];
      
      // Generate realistic bedroom/bathroom combinations
      const bedroomOptions = [1, 2, 3, 4, 5];
      const bedroomWeights = [0.1, 0.25, 0.35, 0.25, 0.05]; // Most common: 2-4 bedrooms
      const bedrooms = this.weightedRandom(bedroomOptions, bedroomWeights);
      
      // Bathrooms correlate with bedrooms but add variation
      const bathrooms = Math.max(1, bedrooms + (Math.random() > 0.7 ? 1 : 0) + (Math.random() > 0.9 ? 1 : 0) - (Math.random() > 0.8 ? 1 : 0));
      
      // Generate price based on city, bedrooms, and random variation
      const basePrice = city.avgPrice;
      const bedroomMultiplier = 0.7 + (bedrooms * 0.15); // More bedrooms = higher price
      const variation = 1 + (Math.random() - 0.5) * city.priceRange;
      const price = Math.round(basePrice * bedroomMultiplier * variation / 1000) * 1000; // Round to nearest 1K

      // Generate square footage based on bedrooms and property type
      const baseSqFt = bedrooms * 400 + 200;
      const sqFtVariation = 1 + (Math.random() - 0.5) * 0.4;
      const square_feet = Math.round(baseSqFt * sqFtVariation / 50) * 50; // Round to nearest 50

      // Generate realistic address
      const streetNumber = Math.floor(Math.random() * 9000) + 1000;
      const streetName = this.streetNames[Math.floor(Math.random() * this.streetNames.length)];
      const address = `${streetNumber} ${streetName}`;

      // Generate ZIP code (realistic patterns)
      const zipCode = this.generateZipCode(city.state);

      // Generate random features (2-6 features per property)
      const numFeatures = Math.floor(Math.random() * 5) + 2;
      const selectedFeatures = this.shuffleArray([...this.features]).slice(0, numFeatures);

      // Generate year built (realistic distribution)
      const currentYear = new Date().getFullYear();
      const yearBuilt = Math.floor(Math.random() * 60) + (currentYear - 60); // Last 60 years

      // Generate lot size (varies by property type)
      const lotSize = propertyType === 'Condo' 
        ? null 
        : Math.round((Math.random() * 0.5 + 0.1) * 100) / 100; // 0.1 to 0.6 acres

      // Generate garage spaces
      const garageSpaces = Math.random() > 0.3 ? Math.floor(Math.random() * 3) + 1 : 0;

      // Generate property description
      const description = this.generateDescription(propertyType, bedrooms, bathrooms, selectedFeatures, city);

      // Generate realistic MLS number
      const mlsNumber = `MLS${Math.floor(Math.random() * 900000) + 100000}`;

      // Generate listing date (last 90 days)
      const daysAgo = Math.floor(Math.random() * 90);
      const listingDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const listing: InsertRepliersListing = {
        id: `TEST_${String(i + 1).padStart(6, '0')}`,
        address,
        price,
        bedrooms,
        bathrooms: bathrooms.toString(),
        square_feet,
        property_type: propertyType,
        city: city.city,
        state: city.state,
        zip_code: zipCode,
        description,
        features: JSON.stringify(selectedFeatures),
        images: JSON.stringify(this.generateImageUrls(i + 1)), // Generate realistic image URLs
        listing_date: listingDate,
        status: 'active',
        mls_number: mlsNumber,
        lot_size: lotSize?.toString(),
        year_built: yearBuilt,
        garage_spaces: garageSpaces,
      };

      listings.push(listing);
    }

    // Insert all listings into database
    console.log('💾 Saving listings to database...');
    await this.batchInsertListings(listings);
    
    console.log(`✅ Successfully generated and saved ${count} test listings!`);
    await this.generateSeedingSummary();
  }

  /**
   * Batch insert listings with error handling
   */
  private async batchInsertListings(listings: InsertRepliersListing[]): Promise<void> {
    const batchSize = 50;
    let inserted = 0;

    for (let i = 0; i < listings.length; i += batchSize) {
      const batch = listings.slice(i, i + batchSize);
      
      try {
        await db.insert(repliersListings).values(batch);
        inserted += batch.length;
        console.log(`  📝 Inserted ${inserted}/${listings.length} listings...`);
      } catch (error) {
        console.error(`Error inserting batch starting at ${i}:`, error.message);
      }
    }
  }

  /**
   * Generate weighted random selection
   */
  private weightedRandom<T>(items: T[], weights: number[]): T {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return items[i];
      }
    }

    return items[items.length - 1];
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Generate realistic ZIP codes by state
   */
  private generateZipCode(state: string): string {
    const zipRanges: Record<string, [number, number]> = {
      'TX': [73000, 79999],
      'CA': [90000, 96999],
      'FL': [32000, 34999],
      'AZ': [85000, 86999],
      'CO': [80000, 81999],
      'GA': [30000, 31999],
    };

    const [min, max] = zipRanges[state] || [10000, 99999];
    return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
  }

  /**
   * Generate property description
   */
  private generateDescription(
    propertyType: string,
    bedrooms: number,
    bathrooms: number,
    features: string[],
    city: { city: string; state: string }
  ): string {
    const openings = [
      `Beautiful ${bedrooms}-bedroom ${propertyType.toLowerCase()} in ${city.city}`,
      `Stunning ${propertyType.toLowerCase()} featuring ${bedrooms} bedrooms`,
      `Move-in ready ${propertyType.toLowerCase()} with ${bedrooms} bedrooms and ${bathrooms} bathrooms`,
      `Charming ${bedrooms}BR/${bathrooms}BA ${propertyType.toLowerCase()}`,
    ];

    const middles = [
      `This well-maintained property offers ${features.slice(0, 2).join(' and ').toLowerCase()}`,
      `Highlights include ${features.slice(0, 2).join(', ').toLowerCase()}`,
      `Features include ${features.slice(0, 3).join(', ').toLowerCase()}`,
    ];

    const endings = [
      `Don't miss this opportunity in ${city.city}!`,
      `Schedule your showing today!`,
      `Perfect for anyone looking in ${city.city}.`,
      `Great location with easy access to amenities.`,
    ];

    const opening = openings[Math.floor(Math.random() * openings.length)];
    const middle = middles[Math.floor(Math.random() * middles.length)];
    const ending = endings[Math.floor(Math.random() * endings.length)];

    return `${opening}. ${middle}. ${ending}`;
  }

  /**
   * Generate realistic image URLs for testing
   */
  private generateImageUrls(listingNumber: number): string[] {
    const baseUrl = `https://example-mls-images.com/listing_${String(listingNumber).padStart(6, '0')}`;
    const imageCount = Math.floor(Math.random() * 15) + 5; // 5-20 images
    
    return Array.from({ length: imageCount }, (_, i) => `${baseUrl}_${i + 1}.jpg`);
  }

  /**
   * Generate summary of test data
   */
  private async generateSeedingSummary(): Promise<void> {
    const summary = await db.execute(`
      SELECT 
        COUNT(*) as total_listings,
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        COUNT(DISTINCT city) as unique_cities,
        COUNT(DISTINCT state) as unique_states,
        AVG(bedrooms) as avg_bedrooms,
        COUNT(CASE WHEN bedrooms = 1 THEN 1 END) as one_br,
        COUNT(CASE WHEN bedrooms = 2 THEN 1 END) as two_br,
        COUNT(CASE WHEN bedrooms = 3 THEN 1 END) as three_br,
        COUNT(CASE WHEN bedrooms >= 4 THEN 1 END) as four_plus_br
      FROM repliers_listings
    `);

    const citySummary = await db.execute(`
      SELECT city, state, COUNT(*) as count, AVG(price) as avg_price
      FROM repliers_listings 
      GROUP BY city, state 
      ORDER BY count DESC
    `);

    console.log('\n📊 TEST DATA SUMMARY:');
    console.log('====================');
    
    if (summary.rows.length > 0) {
      const stats = summary.rows[0] as any;
      console.log(`Total Listings: ${stats.total_listings}`);
      console.log(`Price Range: $${Math.round(stats.min_price).toLocaleString()} - $${Math.round(stats.max_price).toLocaleString()}`);
      console.log(`Average Price: $${Math.round(stats.avg_price).toLocaleString()}`);
      console.log(`Unique Cities: ${stats.unique_cities}`);
      console.log(`Unique States: ${stats.unique_states}`);
      console.log(`Average Bedrooms: ${Number(stats.avg_bedrooms).toFixed(1)}`);
      console.log('\nBedroom Distribution:');
      console.log(`  1 BR: ${stats.one_br} listings`);
      console.log(`  2 BR: ${stats.two_br} listings`);
      console.log(`  3 BR: ${stats.three_br} listings`);
      console.log(`  4+ BR: ${stats.four_plus_br} listings`);
    }

    console.log('\nCities by Listing Count:');
    citySummary.rows.forEach((row: any) => {
      console.log(`  ${row.city}, ${row.state}: ${row.count} listings (avg: $${Math.round(row.avg_price).toLocaleString()})`);
    });
  }

  /**
   * Clear all test listings
   */
  async clearListings(): Promise<void> {
    console.log('🗑️ Clearing all test listings...');
    await db.delete(repliersListings);
    console.log('✅ All listings cleared');
  }
}

// CLI interface
async function main() {
  const action = process.argv[2];
  const generator = new TestListingGenerator();

  try {
    switch (action) {
      case 'generate':
        const count = parseInt(process.argv[3]) || 200;
        await generator.generateTestListings(count);
        break;
      
      case 'clear':
        await generator.clearListings();
        break;
      
      default:
        console.log('Usage:');
        console.log('  tsx server/generate-test-listings.ts generate [count]  - Generate test listings');
        console.log('  tsx server/generate-test-listings.ts clear             - Clear all listings');
        break;
    }
  } catch (error) {
    console.error('❌ Generation failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly (ES module check)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { TestListingGenerator };
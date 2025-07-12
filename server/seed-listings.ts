import { db } from './db';
import { repliersListings, type InsertRepliersListing } from '../shared/schema';
import { eq } from 'drizzle-orm';

interface RepliersAPIListing {
  id: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  square_feet?: number;
  property_type: string;
  city: string;
  state: string;
  zip_code?: string;
  description?: string;
  features?: string[];
  images?: string[];
  listing_date?: string;
  status?: string;
  mls_number?: string;
  lot_size?: number;
  year_built?: number;
  garage_spaces?: number;
}

class ListingSeeder {
  private apiKey: string;
  private baseUrl = 'https://api.repliers.io';

  constructor() {
    this.apiKey = process.env.REPLIERS_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('REPLIERS_API_KEY environment variable is required');
    }
  }

  /**
   * Fetch listings from multiple cities and price ranges
   */
  async seedListings(maxListings = 200): Promise<void> {
    console.log(`🌱 Starting to seed ${maxListings} listings from Repliers API...`);

    // Define diverse search parameters for comprehensive dataset
    const searchParams = [
      // Texas markets
      { city: 'Austin', state: 'TX', minPrice: 200000, maxPrice: 800000 },
      { city: 'Dallas', state: 'TX', minPrice: 150000, maxPrice: 600000 },
      { city: 'Houston', state: 'TX', minPrice: 180000, maxPrice: 700000 },
      
      // California markets
      { city: 'Los Angeles', state: 'CA', minPrice: 400000, maxPrice: 1200000 },
      { city: 'San Diego', state: 'CA', minPrice: 350000, maxPrice: 1000000 },
      
      // Florida markets
      { city: 'Miami', state: 'FL', minPrice: 250000, maxPrice: 800000 },
      { city: 'Orlando', state: 'FL', minPrice: 180000, maxPrice: 500000 },
      
      // Other major markets
      { city: 'Phoenix', state: 'AZ', minPrice: 200000, maxPrice: 600000 },
      { city: 'Denver', state: 'CO', minPrice: 300000, maxPrice: 800000 },
      { city: 'Atlanta', state: 'GA', minPrice: 150000, maxPrice: 500000 },
    ];

    let totalSeeded = 0;
    const perSearch = Math.ceil(maxListings / searchParams.length);

    for (const params of searchParams) {
      if (totalSeeded >= maxListings) break;

      try {
        console.log(`🔍 Fetching listings for ${params.city}, ${params.state}...`);
        const listings = await this.fetchListingsFromAPI(params, perSearch);
        
        if (listings.length > 0) {
          const seeded = await this.saveListingsToDB(listings);
          totalSeeded += seeded;
          console.log(`✅ Seeded ${seeded} listings from ${params.city}, ${params.state}`);
        }

        // Small delay to be respectful to API
        await this.delay(500);
      } catch (error) {
        console.error(`❌ Error fetching listings for ${params.city}:`, error.message);
      }
    }

    console.log(`🎉 Seeding complete! Total listings seeded: ${totalSeeded}`);
    await this.generateSeedingSummary();
  }

  /**
   * Fetch listings from Repliers API
   */
  private async fetchListingsFromAPI(params: any, limit: number): Promise<RepliersAPIListing[]> {
    const url = new URL(`${this.baseUrl}/listings`);
    url.searchParams.set('city', params.city);
    url.searchParams.set('state', params.state);
    url.searchParams.set('minPrice', params.minPrice.toString());
    url.searchParams.set('maxPrice', params.maxPrice.toString());
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('propertyType', 'Single Family,Townhouse,Condo');

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.listings || [];
  }

  /**
   * Save listings to database with conflict handling
   */
  private async saveListingsToDB(listings: RepliersAPIListing[]): Promise<number> {
    let savedCount = 0;

    for (const listing of listings) {
      try {
        // Check if listing already exists
        const existing = await db
          .select()
          .from(repliersListings)
          .where(eq(repliersListings.id, listing.id))
          .limit(1);

        if (existing.length > 0) {
          continue; // Skip duplicates
        }

        // Transform API data to database format
        const dbListing: InsertRepliersListing = {
          id: listing.id,
          address: listing.address,
          price: listing.price,
          bedrooms: listing.bedrooms || 0,
          bathrooms: listing.bathrooms || 0,
          square_feet: listing.square_feet,
          property_type: listing.property_type,
          city: listing.city,
          state: listing.state,
          zip_code: listing.zip_code,
          description: listing.description,
          features: listing.features ? JSON.stringify(listing.features) : null,
          images: listing.images ? JSON.stringify(listing.images) : null,
          listing_date: listing.listing_date,
          status: listing.status || 'active',
          mls_number: listing.mls_number,
          lot_size: listing.lot_size,
          year_built: listing.year_built,
          garage_spaces: listing.garage_spaces,
        };

        await db.insert(repliersListings).values(dbListing);
        savedCount++;
      } catch (error) {
        console.error(`Error saving listing ${listing.id}:`, error.message);
      }
    }

    return savedCount;
  }

  /**
   * Generate summary of seeded data
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

    console.log('\n📊 SEEDING SUMMARY:');
    console.log('==================');
    
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

    console.log('\nTop Cities by Listing Count:');
    citySummary.rows.slice(0, 10).forEach((row: any) => {
      console.log(`  ${row.city}, ${row.state}: ${row.count} listings (avg: $${Math.round(row.avg_price).toLocaleString()})`);
    });
  }

  /**
   * Clear all seeded listings
   */
  async clearListings(): Promise<void> {
    console.log('🗑️ Clearing all seeded listings...');
    await db.delete(repliersListings);
    console.log('✅ All listings cleared');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI interface
async function main() {
  const action = process.argv[2];
  const seeder = new ListingSeeder();

  try {
    switch (action) {
      case 'seed':
        const maxListings = parseInt(process.argv[3]) || 200;
        await seeder.seedListings(maxListings);
        break;
      
      case 'clear':
        await seeder.clearListings();
        break;
      
      default:
        console.log('Usage:');
        console.log('  npm run seed:listings seed [max_listings]  - Seed listings from API');
        console.log('  npm run seed:listings clear               - Clear all seeded listings');
        break;
    }
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly (ES module check)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ListingSeeder };
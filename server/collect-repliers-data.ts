import { db } from './db';
import { repliersListings, type InsertRepliersListing } from '../shared/schema';
import { repliersAPI, type RepliersListing } from './repliers-api';
import { eq } from 'drizzle-orm';

/**
 * Collect real data from Repliers API using the same endpoints as the application
 * Creates diverse test profiles to collect comprehensive listing data
 */
class RepliersDataCollector {

  // Test buyer profiles with diverse criteria to collect maximum data variety
  private testProfiles = [
    // Budget-focused searches across different price ranges
    {
      name: "Budget Collector 1",
      budgetMin: 150000,
      budgetMax: 300000,
      bedrooms: 2,
      bathrooms: "2+",
      homeType: "condo",
      preferredAreas: ["Austin"]
    },
    {
      name: "Budget Collector 2", 
      budgetMin: 300000,
      budgetMax: 500000,
      bedrooms: 3,
      bathrooms: "2+",
      homeType: "single-family",
      preferredAreas: ["Austin"]
    },
    {
      name: "Budget Collector 3",
      budgetMin: 500000,
      budgetMax: 800000,
      bedrooms: 4,
      bathrooms: "3+",
      homeType: "single-family", 
      preferredAreas: ["Austin"]
    },
    
    // Geographic diversity
    {
      name: "Dallas Collector",
      budgetMin: 200000,
      budgetMax: 600000,
      bedrooms: 3,
      bathrooms: "2+",
      homeType: "single-family",
      preferredAreas: ["Dallas"]
    },
    {
      name: "Houston Collector",
      budgetMin: 180000,
      budgetMax: 550000,
      bedrooms: 3,
      bathrooms: "2+",
      homeType: "single-family",
      preferredAreas: ["Houston"]
    },
    {
      name: "Los Angeles Collector",
      budgetMin: 400000,
      budgetMax: 1000000,
      bedrooms: 2,
      bathrooms: "2+",
      homeType: "condo",
      preferredAreas: ["Los Angeles"]
    },
    {
      name: "Miami Collector",
      budgetMin: 250000,
      budgetMax: 700000,
      bedrooms: 2,
      bathrooms: "2+",
      homeType: "condo",
      preferredAreas: ["Miami"]
    },
    {
      name: "Phoenix Collector",
      budgetMin: 200000,
      budgetMax: 550000,
      bedrooms: 3,
      bathrooms: "2+",
      homeType: "single-family",
      preferredAreas: ["Phoenix"]
    },
    
    // Property type diversity
    {
      name: "Condo Collector",
      budgetMin: 200000,
      budgetMax: 600000,
      bedrooms: 2,
      bathrooms: "1+",
      homeType: "condo",
      preferredAreas: ["Austin"]
    },
    {
      name: "Townhouse Collector",
      budgetMin: 250000,
      budgetMax: 650000,
      bedrooms: 3,
      bathrooms: "2+",
      homeType: "townhouse",
      preferredAreas: ["Austin"]
    },
    
    // Bedroom/bathroom variations
    {
      name: "Studio Collector",
      budgetMin: 100000,
      budgetMax: 350000,
      bedrooms: 1,
      bathrooms: "1+",
      homeType: "condo",
      preferredAreas: ["Austin"]
    },
    {
      name: "Large Family Collector",
      budgetMin: 400000,
      budgetMax: 900000,
      bedrooms: 5,
      bathrooms: "3+",
      homeType: "single-family",
      preferredAreas: ["Austin"]
    },
    
    // Location-only searches (no budget constraints) for maximum listings
    {
      name: "Open Austin Search",
      bedrooms: 2,
      bathrooms: "1+",
      preferredAreas: ["Austin"]
    },
    {
      name: "Open Dallas Search", 
      bedrooms: 3,
      bathrooms: "2+",
      preferredAreas: ["Dallas"]
    },
    {
      name: "Open Houston Search",
      bedrooms: 3,
      bathrooms: "2+", 
      preferredAreas: ["Houston"]
    }
  ];

  /**
   * Collect listings using all test profiles to get comprehensive data
   */
  async collectAllListings(maxListingsPerProfile = 100): Promise<void> {
    console.log(`🔍 Collecting listings from Repliers API using ${this.testProfiles.length} diverse search profiles...`);
    
    let totalCollected = 0;
    const uniqueListings = new Map<string, RepliersListing>();

    for (let i = 0; i < this.testProfiles.length; i++) {
      const profile = this.testProfiles[i];
      
      try {
        console.log(`\n📋 Profile ${i + 1}/${this.testProfiles.length}: ${profile.name}`);
        console.log(`   Budget: ${profile.budgetMin ? '$' + profile.budgetMin.toLocaleString() : 'No min'} - ${profile.budgetMax ? '$' + profile.budgetMax.toLocaleString() : 'No max'}`);
        console.log(`   ${profile.bedrooms}BR/${profile.bathrooms}BA ${profile.homeType} in ${profile.preferredAreas[0]}`);
        
        // Use the same API service as the application
        const listings = await repliersAPI.searchListings(profile);
        
        if (listings && listings.length > 0) {
          // Add unique listings to our collection
          let newListings = 0;
          const limitedListings = listings.slice(0, maxListingsPerProfile);
          
          for (const listing of limitedListings) {
            if (!uniqueListings.has(listing.id)) {
              uniqueListings.set(listing.id, listing);
              newListings++;
            }
          }
          
          console.log(`   ✅ Found ${listings.length} listings, ${newListings} new unique listings`);
          totalCollected += newListings;
        } else {
          console.log(`   ⚠️ No listings found for this profile`);
        }

        // Respectful delay between API calls
        await this.delay(1000);
        
      } catch (error) {
        console.error(`   ❌ Error with profile "${profile.name}":`, error.message);
      }
    }

    console.log(`\n💾 Saving ${uniqueListings.size} unique listings to database...`);
    
    // Convert to database format and save
    const dbListings: InsertRepliersListing[] = [];
    
    for (const [id, listing] of uniqueListings) {
      try {
        const dbListing = this.transformToDbFormat(listing);
        dbListings.push(dbListing);
      } catch (error) {
        console.error(`Error transforming listing ${id}:`, error.message);
      }
    }

    await this.batchSaveListings(dbListings);
    
    console.log(`\n🎉 Data collection complete!`);
    console.log(`   Total unique listings collected: ${uniqueListings.size}`);
    console.log(`   Successfully saved to database: ${dbListings.length}`);
    
    await this.generateDataSummary();
  }

  /**
   * Transform Repliers API listing to database format
   */
  private transformToDbFormat(listing: RepliersListing): InsertRepliersListing {
    return {
      id: listing.id,
      address: listing.address,
      price: listing.price,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms.toString(),
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
      garage_spaces: null, // Not in Repliers API response
    };
  }

  /**
   * Batch save listings with conflict handling
   */
  private async batchSaveListings(listings: InsertRepliersListing[]): Promise<void> {
    const batchSize = 25;
    let saved = 0;

    for (let i = 0; i < listings.length; i += batchSize) {
      const batch = listings.slice(i, i + batchSize);
      
      // Save each listing individually to handle conflicts
      for (const listing of batch) {
        try {
          // Check if exists
          const existing = await db
            .select()
            .from(repliersListings)
            .where(eq(repliersListings.id, listing.id))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(repliersListings).values(listing);
            saved++;
          }
        } catch (error) {
          console.error(`Error saving listing ${listing.id}:`, error.message);
        }
      }
      
      console.log(`   📝 Processed ${Math.min(i + batchSize, listings.length)}/${listings.length} listings, ${saved} saved...`);
    }
  }

  /**
   * Generate comprehensive data summary
   */
  private async generateDataSummary(): Promise<void> {
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
        COUNT(CASE WHEN bedrooms >= 4 THEN 1 END) as four_plus_br,
        COUNT(CASE WHEN property_type = 'Single Family' THEN 1 END) as single_family,
        COUNT(CASE WHEN property_type = 'Condo' THEN 1 END) as condos,
        COUNT(CASE WHEN property_type = 'Townhouse' THEN 1 END) as townhouses
      FROM repliers_listings
    `);

    const citySummary = await db.execute(`
      SELECT city, state, COUNT(*) as count, 
             AVG(price) as avg_price, MIN(price) as min_price, MAX(price) as max_price
      FROM repliers_listings 
      GROUP BY city, state 
      ORDER BY count DESC
    `);

    const priceRanges = await db.execute(`
      SELECT 
        COUNT(CASE WHEN price < 200000 THEN 1 END) as under_200k,
        COUNT(CASE WHEN price >= 200000 AND price < 400000 THEN 1 END) as price_200_400k,
        COUNT(CASE WHEN price >= 400000 AND price < 600000 THEN 1 END) as price_400_600k,
        COUNT(CASE WHEN price >= 600000 AND price < 800000 THEN 1 END) as price_600_800k,
        COUNT(CASE WHEN price >= 800000 THEN 1 END) as over_800k
      FROM repliers_listings
    `);

    console.log('\n📊 REPLIERS DATA COLLECTION SUMMARY:');
    console.log('=====================================');
    
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
      
      console.log('\nProperty Type Distribution:');
      console.log(`  Single Family: ${stats.single_family} listings`);
      console.log(`  Condos: ${stats.condos} listings`);
      console.log(`  Townhouses: ${stats.townhouses} listings`);
    }

    if (priceRanges.rows.length > 0) {
      const prices = priceRanges.rows[0] as any;
      console.log('\nPrice Range Distribution:');
      console.log(`  Under $200K: ${prices.under_200k} listings`);
      console.log(`  $200K-$400K: ${prices.price_200_400k} listings`);
      console.log(`  $400K-$600K: ${prices.price_400_600k} listings`);
      console.log(`  $600K-$800K: ${prices.price_600_800k} listings`);
      console.log(`  Over $800K: ${prices.over_800k} listings`);
    }

    console.log('\nTop Cities by Listing Count:');
    citySummary.rows.forEach((row: any) => {
      console.log(`  ${row.city}, ${row.state}: ${row.count} listings`);
      console.log(`    Price range: $${Math.round(row.min_price).toLocaleString()} - $${Math.round(row.max_price).toLocaleString()}`);
      console.log(`    Average: $${Math.round(row.avg_price).toLocaleString()}`);
    });

    console.log('\n✅ Data collection ready for testing buyer profiles and search functionality!');
  }

  /**
   * Clear all collected listings
   */
  async clearListings(): Promise<void> {
    console.log('🗑️ Clearing all collected listings...');
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
  const collector = new RepliersDataCollector();

  try {
    switch (action) {
      case 'collect':
        const maxPerProfile = parseInt(process.argv[3]) || 100;
        console.log(`🚀 Starting Repliers API data collection (max ${maxPerProfile} listings per profile)...`);
        await collector.collectAllListings(maxPerProfile);
        break;
      
      case 'clear':
        await collector.clearListings();
        break;
      
      default:
        console.log('Usage:');
        console.log('  tsx server/collect-repliers-data.ts collect [max_per_profile]  - Collect listings from Repliers API');
        console.log('  tsx server/collect-repliers-data.ts clear                      - Clear all collected listings');
        console.log('');
        console.log('This script uses the same Repliers API endpoints as your application');
        console.log('to collect comprehensive test data for buyer profile testing.');
        break;
    }
  } catch (error) {
    console.error('❌ Data collection failed:', error.message);
    
    if (error.message.includes('REPLIERS_API_KEY')) {
      console.log('\n💡 Make sure your REPLIERS_API_KEY environment variable is set.');
    }
    if (error.message.includes('401') || error.message.includes('403')) {
      console.log('\n💡 Check if your IP address is whitelisted with Repliers.');
    }
    
    process.exit(1);
  }
}

// Run if called directly (ES module check)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { RepliersDataCollector };
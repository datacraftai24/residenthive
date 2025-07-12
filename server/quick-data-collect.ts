import { db } from './db';
import { repliersListings, type InsertRepliersListing } from '../shared/schema';
import { repliersAPI, type RepliersListing } from './repliers-api';
import { eq } from 'drizzle-orm';

/**
 * Quick data collection focused on key markets
 */
class QuickDataCollector {

  // Focused collection profiles for key markets
  private focusedProfiles = [
    {
      name: "Austin All Properties",
      bedrooms: 2,
      bathrooms: "1+",
      preferredAreas: ["Austin"]
    },
    {
      name: "Dallas All Properties", 
      bedrooms: 3,
      bathrooms: "2+",
      preferredAreas: ["Dallas"]
    },
    {
      name: "Houston All Properties",
      bedrooms: 3,
      bathrooms: "2+", 
      preferredAreas: ["Houston"]
    }
  ];

  /**
   * Quick collection with immediate save
   */
  async quickCollect(): Promise<void> {
    console.log('🚀 Quick data collection starting...');
    
    let totalSaved = 0;

    for (let i = 0; i < this.focusedProfiles.length; i++) {
      const profile = this.focusedProfiles[i];
      
      try {
        console.log(`\n📋 ${profile.name}...`);
        
        const listings = await repliersAPI.searchListings(profile);
        
        if (listings && listings.length > 0) {
          console.log(`   Found ${listings.length} listings, saving to database...`);
          
          // Take first 30 listings and save immediately
          const limitedListings = listings.slice(0, 30);
          let saved = 0;
          
          for (const listing of limitedListings) {
            try {
              // Check if exists
              const existing = await db
                .select()
                .from(repliersListings)
                .where(eq(repliersListings.id, listing.id))
                .limit(1);

              if (existing.length === 0) {
                const dbListing = this.transformToDbFormat(listing);
                await db.insert(repliersListings).values(dbListing);
                saved++;
              }
            } catch (error) {
              // Skip individual listing errors
            }
          }
          
          console.log(`   ✅ Saved ${saved} new listings`);
          totalSaved += saved;
        } else {
          console.log(`   ⚠️ No listings found`);
        }

        // Short delay
        await this.delay(500);
        
      } catch (error) {
        console.error(`   ❌ Error with ${profile.name}:`, error.message);
      }
    }

    console.log(`\n🎉 Quick collection complete! Total saved: ${totalSaved}`);
    await this.showSummary();
  }

  /**
   * Transform to database format
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
      garage_spaces: null,
    };
  }

  /**
   * Show quick summary
   */
  private async showSummary(): Promise<void> {
    const summary = await db.execute(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT city) as cities,
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price
      FROM repliers_listings
    `);

    if (summary.rows.length > 0) {
      const stats = summary.rows[0] as any;
      console.log('\n📊 Current Database:');
      console.log(`   Total listings: ${stats.total}`);
      console.log(`   Cities: ${stats.cities}`);
      console.log(`   Price range: $${Math.round(stats.min_price).toLocaleString()} - $${Math.round(stats.max_price).toLocaleString()}`);
      console.log(`   Average: $${Math.round(stats.avg_price).toLocaleString()}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI interface
async function main() {
  const collector = new QuickDataCollector();

  try {
    await collector.quickCollect();
  } catch (error) {
    console.error('❌ Quick collection failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { QuickDataCollector };
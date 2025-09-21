// Test extraction for 17 Thenius St property
import { extractUnits } from './server/services/extraction/two-pass-extractor';

// The actual description from 17 Thenius St
const mlsData = {
  mlsNumber: "99999999",
  address: "17 Thenius St",
  listPrice: 499000,
  propertyType: "3-Family",
  units: 3,
  bedrooms: 5,
  bathrooms: 3,
  description: "Investment opportunity in this 3 family home situated in a fantastic convenient location, minutes to Mass Pike, Routes 9, 20 and 290 and close to public transportation, shopping restaurants and more. 1st and 2nd unit features spacious bedrooms, living area and eat-in kitchens, the 3rd unit is a spacious studio with hardwood floors. Ample off street parking, updated gas heating system for all three units (2017), updated hot water tanks owned, separate utilities - tenants pay for heat, hot water and electricity, long term tenants. There is also extra space in the basement for storage.",
  remarks: "Investment opportunity in this 3 family home situated in a fantastic convenient location."
};

async function test() {
  console.log("===== Testing 17 Thenius St Property =====");
  console.log("Address:", mlsData.address);
  console.log("Property Type:", mlsData.propertyType);
  console.log("Expected: 3 units (2x 2BR + 1x Studio)");
  console.log("\nDescription:", mlsData.description);
  console.log("\n");

  try {
    const result = await extractUnits(mlsData);
    
    console.log("\n===== EXTRACTION RESULTS =====");
    console.log("Units extracted:", result.units);
    console.log("Total bedrooms:", result.totalBeds);
    console.log("\nUnit breakdown:");
    result.mix_resolution.final_mix.forEach(unit => {
      console.log(`  - ${unit.unit_id}: ${unit.label} (${unit.confidence} confidence, ${unit.source})`);
    });
    
    console.log("\n===== VALIDATION =====");
    const expectedUnits = [
      { id: 'U1', type: '2BR' },
      { id: 'U2', type: '2BR' },
      { id: 'U3', type: 'Studio' }
    ];
    
    const actualUnits = result.mix_resolution.final_mix.map(u => ({
      id: u.unit_id,
      type: u.label
    }));
    
    let allCorrect = true;
    for (const expected of expectedUnits) {
      const found = actualUnits.find(a => a.id === expected.id && a.type === expected.type);
      if (found) {
        console.log(`✓ ${expected.id}: ${expected.type} - CORRECT`);
      } else {
        const actualUnit = actualUnits.find(a => a.id === expected.id);
        if (actualUnit) {
          console.log(`✗ ${expected.id}: Expected ${expected.type}, got ${actualUnit.type}`);
        } else {
          console.log(`✗ ${expected.id}: Expected ${expected.type}, NOT FOUND`);
        }
        allCorrect = false;
      }
    }
    
    if (allCorrect) {
      console.log("\n✅ ALL UNITS EXTRACTED CORRECTLY!");
    } else {
      console.log("\n❌ EXTRACTION INCOMPLETE OR INCORRECT");
    }
    
  } catch (error) {
    console.error("Error during extraction:", error);
  }
}

test();
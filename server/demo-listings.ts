// Demo listing data based on actual Austin/Georgetown/Elgin market analysis
export const demoListings = [
  // Austin listings for young professionals (Sarah Chen profile)
  {
    id: "austin_condo_001",
    price: 385000,
    bedrooms: 3,
    bathrooms: 2,
    property_type: "condo",
    address: "1234 Tech District Blvd",
    city: "Austin",
    state: "TX",
    zip_code: "78701",
    square_feet: 1200,
    year_built: 2018,
    description: "Modern condo in downtown Austin with updated kitchen, granite counters, and high-speed fiber internet. Walking distance to tech companies and nightlife. Balcony with city views.",
    features: ["Modern Kitchen", "High-speed Internet", "Granite Counters", "Balcony", "Garage Parking", "Fiber Internet", "Downtown Location"],
    mls_number: "ATX001234",
    status: "active"
  },
  {
    id: "georgetown_condo_002", 
    price: 425000,
    bedrooms: 3,
    bathrooms: 2.5,
    property_type: "condo",
    address: "567 Heritage Square",
    city: "Georgetown", 
    state: "TX",
    zip_code: "78626",
    square_feet: 1350,
    year_built: 2020,
    description: "Brand new condo with gourmet kitchen, work-from-home office space, and covered parking. Low-maintenance living with HOA managing exteriors.",
    features: ["Gourmet Kitchen", "Home Office", "Covered Parking", "New Construction", "Low Maintenance"],
    mls_number: "GTX002567",
    status: "active"
  },

  // Georgetown family homes (Mike Rodriguez profile)  
  {
    id: "georgetown_house_003",
    price: 350000,
    bedrooms: 4,
    bathrooms: 3,
    property_type: "house",
    address: "890 Family Circle Dr",
    city: "Georgetown",
    state: "TX", 
    zip_code: "78628",
    square_feet: 2100,
    lot_size: "0.25 acres",
    year_built: 2015,
    description: "Beautiful family home in quiet neighborhood with large backyard, excellent Georgetown ISD schools, and family room. Safe cul-de-sac location perfect for kids.",
    features: ["Large Yard", "Family Room", "Excellent Schools", "Quiet Street", "Storage Space", "Two-Car Garage"],
    mls_number: "GTX003890", 
    status: "active"
  },
  {
    id: "elgin_house_004",
    price: 320000,
    bedrooms: 3,
    bathrooms: 2.5,
    property_type: "house", 
    address: "456 School District Ln",
    city: "Elgin",
    state: "TX",
    zip_code: "78621",
    square_feet: 1800,
    lot_size: "0.3 acres",
    year_built: 2012,
    description: "Spacious family home with large yard, excellent Elgin ISD schools nearby, and safe neighborhood. Great for growing families with parks and recreation close by.",
    features: ["Large Yard", "Family Room", "Good Schools", "Safe Neighborhood", "Parks Nearby", "Storage Space"],
    mls_number: "ELG004456",
    status: "active"
  },

  // Investment properties (Jennifer Park profile)
  {
    id: "austin_townhouse_005", 
    price: 295000,
    bedrooms: 2,
    bathrooms: 2,
    property_type: "townhouse",
    address: "123 Rental Income Way",
    city: "Austin",
    state: "TX",
    zip_code: "78745",
    square_feet: 1100,
    year_built: 2010,
    description: "Well-maintained townhouse perfect for rental investment. Low-maintenance exterior, good tenant demand area, and excellent rental history. Two-car garage and modern amenities.",
    features: ["Low Maintenance", "Rental History", "Two-Car Garage", "Good Tenant Area", "Investment Property"],
    mls_number: "ATX005123",
    status: "active"
  },
  {
    id: "elgin_investment_006",
    price: 280000, 
    bedrooms: 3,
    bathrooms: 2,
    property_type: "house",
    address: "789 Cash Flow St", 
    city: "Elgin",
    state: "TX",
    zip_code: "78621",
    square_feet: 1250,
    lot_size: "0.2 acres",
    year_built: 2008,
    description: "Excellent investment opportunity with strong rental demand. Recently updated, low maintenance, and in area with good appreciation potential.",
    features: ["Investment Potential", "Rental Demand", "Recently Updated", "Low Maintenance", "Garage"],
    mls_number: "ELG006789",
    status: "active"
  },

  // Mixed options for testing different scenarios
  {
    id: "austin_overpriced_007",
    price: 550000,
    bedrooms: 2, 
    bathrooms: 1,
    property_type: "condo",
    address: "999 Overpriced Ave",
    city: "Austin", 
    state: "TX",
    zip_code: "78704",
    square_feet: 900,
    year_built: 1995,
    description: "Expensive condo that needs major repairs. Located on busy street with noise issues. No parking included.",
    features: ["Needs Renovation", "Busy Street", "No Parking"],
    mls_number: "ATX007999",
    status: "active"
  },
  {
    id: "georgetown_perfect_008",
    price: 380000,
    bedrooms: 3,
    bathrooms: 2,
    property_type: "house",
    address: "111 Perfect Match Dr",
    city: "Georgetown",
    state: "TX", 
    zip_code: "78626",
    square_feet: 1650,
    lot_size: "0.28 acres",
    year_built: 2019,
    description: "Perfect family home with modern kitchen, large yard, excellent Georgetown schools, and quiet neighborhood. Move-in ready with garage and storage.",
    features: ["Modern Kitchen", "Large Yard", "Excellent Schools", "Quiet Neighborhood", "Garage", "Storage Space", "Move-in Ready"],
    mls_number: "GTX008111", 
    status: "active"
  }
];

// Get demo listings based on profile criteria
export function getDemoListingsForProfile(profile: any) {
  // Filter listings based on basic criteria
  const matchingListings = demoListings.filter(listing => {
    // Budget filter
    const withinBudget = listing.price >= (profile.budgetMin || 0) && 
                        listing.price <= (profile.budgetMax || Infinity);
    
    // Bedroom filter
    const bedroomMatch = listing.bedrooms >= (profile.bedrooms || 1);
    
    // Property type filter (loose matching)
    const typeMatch = !profile.homeType || 
                     listing.property_type === profile.homeType ||
                     (profile.homeType === 'single-family' && listing.property_type === 'house');
    
    // Location filter (check if listing city is in preferred areas)
    let locationMatch = true;
    if (profile.preferredAreas && Array.isArray(profile.preferredAreas)) {
      locationMatch = profile.preferredAreas.some((area: string) => 
        listing.city.toLowerCase().includes(area.toLowerCase())
      );
    }
    
    return withinBudget && bedroomMatch && typeMatch && locationMatch;
  });
  
  return matchingListings;
}
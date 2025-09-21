# Repliers API Search Strategy Guide

## 🎯 Overview
This guide provides a comprehensive strategy for searching properties using the Repliers API, combining aggregates for intelligent filtering and pagination for complete results retrieval.

---

## 📊 Understanding Repliers API Structure

### Core Concepts
1. **Aggregates** - Get distinct values and counts for any field
2. **Pagination** - Retrieve large result sets across multiple pages
3. **Filtering** - Apply precise criteria using valid field values
4. **Performance** - Optimize queries for speed and completeness

---

## 🔍 Search Strategy Workflow

### Step 1: Discovery Phase (Using Aggregates)
Before searching, understand what's available in your target market:

```javascript
// 1. Get available property types in Worcester
GET https://api.repliers.io/listings?
  aggregates=details.propertyType,details.style
  &city=Worcester
  &state=MA
  &listings=false  // Don't return listings, just aggregates

// Response shows what's actually available:
{
  "aggregates": {
    "details": {
      "propertyType": {
        "Single Family": 245,
        "Multi Family": 78,
        "Condo": 21
      },
      "style": {
        "Colonial": 89,
        "Ranch": 67,
        "Cape Cod": 45,
        "2 Family": 23
      }
    }
  }
}
```

### Step 2: Build Valid Search Parameters
Use aggregate results to construct searches with valid values:

```javascript
// ❌ BAD: Guessing at parameter values
{ propertyType: "multi-family" }  // Won't match "Multi Family"

// ✅ GOOD: Using exact values from aggregates
{ propertyType: "Multi Family" }  // Matches API's exact format
```

### Step 3: Implement Smart Pagination
Retrieve ALL matching properties, not just first page:

```javascript
async function searchComprehensively(searchParams) {
  // First, get page 1 to understand scope
  const firstPage = await fetch(`${API_URL}?${params}&pageNum=1`);
  const { count, numPages, listings } = await firstPage.json();
  
  console.log(`Found ${count} total properties across ${numPages} pages`);
  
  // Fetch remaining pages in parallel for speed
  if (numPages > 1) {
    const pagePromises = [];
    for (let page = 2; page <= Math.min(numPages, 10); page++) {
      pagePromises.push(fetch(`${API_URL}?${params}&pageNum=${page}`));
    }
    const additionalPages = await Promise.all(pagePromises);
    // Process additional pages...
  }
}
```

---

## 🏗️ Implementation Architecture

### 1. Pre-Search Intelligence Gathering
```typescript
class RepliersSearchStrategy {
  // Cache aggregate data for performance
  private aggregateCache = new Map();
  
  async getMarketIntelligence(city: string, state: string) {
    const cacheKey = `${city}_${state}`;
    
    if (!this.aggregateCache.has(cacheKey)) {
      const aggregates = await this.fetchAggregates(city, state);
      this.aggregateCache.set(cacheKey, {
        data: aggregates,
        timestamp: Date.now()
      });
    }
    
    return this.aggregateCache.get(cacheKey);
  }
  
  private async fetchAggregates(city: string, state: string) {
    const params = new URLSearchParams({
      city,
      state,
      aggregates: [
        'details.propertyType',
        'details.style', 
        'details.numBedrooms',
        'details.numBathrooms',
        'listPrice'  // Get price ranges
      ].join(','),
      listings: 'false'  // Speed optimization
    });
    
    const response = await fetch(`${REPLIERS_API}/listings?${params}`);
    return response.json();
  }
}
```

### 2. Dynamic Parameter Mapping
```typescript
class ParameterMapper {
  // Map user-friendly terms to API values
  private propertyTypeMap = new Map();
  
  async initialize(aggregates: any) {
    // Build mapping from actual API values
    const propertyTypes = aggregates.details?.propertyType || {};
    
    for (const [apiValue, count] of Object.entries(propertyTypes)) {
      // Map common variations to exact API values
      if (apiValue === "Single Family") {
        this.propertyTypeMap.set("single-family", apiValue);
        this.propertyTypeMap.set("house", apiValue);
        this.propertyTypeMap.set("sfh", apiValue);
      } else if (apiValue === "Multi Family") {
        this.propertyTypeMap.set("multi-family", apiValue);
        this.propertyTypeMap.set("multifamily", apiValue);
        this.propertyTypeMap.set("mfh", apiValue);
      }
      // Always map exact value to itself
      this.propertyTypeMap.set(apiValue.toLowerCase(), apiValue);
    }
  }
  
  mapPropertyType(userInput: string): string {
    return this.propertyTypeMap.get(userInput.toLowerCase()) || userInput;
  }
}
```

### 3. Comprehensive Search with Pagination
```typescript
class ComprehensiveSearch {
  async search(criteria: SearchCriteria): Promise<SearchResults> {
    // Phase 1: Get market intelligence
    const intelligence = await this.getMarketIntelligence(
      criteria.city, 
      criteria.state
    );
    
    // Phase 2: Map parameters to valid API values
    const apiParams = this.mapToAPIParams(criteria, intelligence);
    
    // Phase 3: Execute paginated search
    const allListings = await this.fetchAllPages(apiParams);
    
    // Phase 4: Apply client-side filtering if needed
    return this.postProcessResults(allListings, criteria);
  }
  
  private async fetchAllPages(params: any): Promise<Listing[]> {
    const allListings: Listing[] = [];
    let currentPage = 1;
    let totalPages = 1;
    
    do {
      const response = await this.fetchPage(params, currentPage);
      allListings.push(...response.listings);
      
      if (currentPage === 1) {
        totalPages = response.numPages;
        console.log(`Fetching ${totalPages} pages (${response.count} total properties)`);
      }
      
      currentPage++;
    } while (currentPage <= totalPages && currentPage <= 10); // Safety limit
    
    return allListings;
  }
}
```

---

## 🎭 Search Scenarios & Strategies

### Scenario 1: Investment Property Search ($250k budget in Worcester)
```typescript
async function investmentPropertySearch() {
  // 1. Get aggregates to understand market
  const aggregates = await getAggregates('Worcester', 'MA');
  
  // 2. Identify investment-friendly property types
  const multiFamily = aggregates.details.propertyType['Multi Family'] || 0;
  const twoFamily = aggregates.details.style['2 Family'] || 0;
  
  // 3. Search with proper parameters
  const searchParams = {
    city: 'Worcester',
    state: 'MA',
    maxPrice: 1250000,  // With leverage
    propertyType: multiFamily > 0 ? 'Multi Family' : 'Single Family',
    minBedrooms: 3,
    pageNum: 1,
    resultsPerPage: 100
  };
  
  // 4. Fetch ALL pages to find hidden gems
  const allProperties = await fetchAllPages(searchParams);
  
  // 5. Score and rank by investment potential
  return rankByInvestmentPotential(allProperties);
}
```

### Scenario 2: Comprehensive Market Analysis
```typescript
async function marketAnalysis(city: string, state: string) {
  // 1. Get all aggregates for market understanding
  const aggregates = await fetch(`${API}/listings?` + 
    `city=${city}&state=${state}&` +
    `aggregates=details.propertyType,details.style,` +
    `details.numBedrooms,details.numBathrooms,` +
    `listPrice,address.zip&listings=false`
  );
  
  // 2. Analyze distribution
  const analysis = {
    dominantPropertyType: findMax(aggregates.details.propertyType),
    priceRange: analyzePriceDistribution(aggregates.listPrice),
    hotZipCodes: findTop(aggregates.address.zip, 5),
    inventoryByBedrooms: aggregates.details.numBedrooms
  };
  
  return analysis;
}
```

### Scenario 3: Finding Specific Property (345 Park Ave)
```typescript
async function findSpecificProperty(address: string, city: string) {
  // Problem: Property might be on page 2, 3, or 4
  // Solution: Fetch all pages
  
  const searchParams = {
    city,
    state: 'MA',
    status: 'A',  // Active
    type: 'Sale'
  };
  
  // Fetch all pages (Worcester has 344 properties across 4 pages)
  for (let page = 1; page <= 10; page++) {
    const response = await fetch(`${API}/listings?${params}&pageNum=${page}`);
    const data = await response.json();
    
    const found = data.listings.find(l => 
      l.address.streetName?.includes('Park') && 
      l.address.streetNumber === '345'
    );
    
    if (found) return found;
    if (page >= data.numPages) break;
  }
}
```

---

## ⚡ Performance Optimization

### 1. Aggregate Caching Strategy
```typescript
class AggregateCache {
  private cache = new Map();
  private TTL = 3600000; // 1 hour
  
  async getAggregates(city: string, state: string) {
    const key = `${city}_${state}`;
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.data;
    }
    
    // Fetch fresh aggregates
    const fresh = await this.fetchAggregates(city, state);
    this.cache.set(key, { data: fresh, timestamp: Date.now() });
    return fresh;
  }
}
```

### 2. Parallel Page Fetching
```typescript
async function fetchPagesInParallel(params: any, totalPages: number) {
  // Fetch first page to get metadata
  const firstPage = await fetchPage(params, 1);
  const allListings = [...firstPage.listings];
  
  if (totalPages > 1) {
    // Fetch pages 2-N in parallel
    const promises = [];
    for (let page = 2; page <= Math.min(totalPages, 10); page++) {
      promises.push(fetchPage(params, page));
    }
    
    const results = await Promise.all(promises);
    results.forEach(r => allListings.push(...r.listings));
  }
  
  return allListings;
}
```

### 3. Smart Result Limiting
```typescript
function determinePageLimit(searchCriteria: any): number {
  // High-value searches need comprehensive data
  if (searchCriteria.maxPrice > 1000000) return 10;
  if (searchCriteria.investmentSearch) return 5;
  if (searchCriteria.quickSearch) return 1;
  return 3; // Default
}
```

---

## 🐛 Common Pitfalls & Solutions

### Pitfall 1: Mismatched Parameter Values
```javascript
// ❌ WRONG: Guessing parameter formats
{ propertyType: "multi-family" }  // API expects "Multi Family"
{ status: "Active" }               // API expects "A"

// ✅ RIGHT: Use aggregates to discover exact values
const aggregates = await getAggregates();
const validTypes = Object.keys(aggregates.details.propertyType);
{ propertyType: validTypes.find(t => t.includes("Multi")) }
```

### Pitfall 2: Missing Properties Due to Pagination
```javascript
// ❌ WRONG: Only fetching first page
const results = await fetch(`${API}/listings?city=Worcester`);
// Missing 244 out of 344 properties!

// ✅ RIGHT: Fetch all pages
const allResults = await fetchAllPages({ city: 'Worcester' });
// Gets all 344 properties
```

### Pitfall 3: Slow Aggregate Queries
```javascript
// ❌ WRONG: Fetching listings with aggregates
?aggregates=details.propertyType  // Returns listings + aggregates (slow)

// ✅ RIGHT: Skip listings when only need aggregates
?aggregates=details.propertyType&listings=false  // Much faster!
```

---

## 📝 Implementation Checklist

### For New Developer Onboarding:

1. **Understanding Phase**
   - [ ] Read Repliers API documentation
   - [ ] Understand aggregate concept
   - [ ] Understand pagination model
   - [ ] Review existing code examples

2. **Setup Phase**
   - [ ] Get API key configured
   - [ ] Test basic API call
   - [ ] Verify aggregate endpoint works
   - [ ] Test pagination parameters

3. **Implementation Phase**
   - [ ] Create aggregate discovery function
   - [ ] Build parameter mapping logic
   - [ ] Implement pagination handler
   - [ ] Add error handling
   - [ ] Create caching layer

4. **Testing Phase**
   - [ ] Test with small market (<100 properties)
   - [ ] Test with large market (>500 properties)
   - [ ] Verify specific property retrieval
   - [ ] Performance testing
   - [ ] Error scenario testing

---

## 🎯 Best Practices Summary

1. **Always use aggregates first** to understand available values
2. **Cache aggregate results** for 1 hour to reduce API calls
3. **Fetch all pages** for comprehensive searches (up to reasonable limit)
4. **Use parallel fetching** for pages 2+ to improve performance
5. **Map user inputs** to exact API values using aggregates
6. **Set listings=false** when only fetching aggregates
7. **Implement retry logic** for failed page fetches
8. **Log pagination stats** (e.g., "Retrieved 244/344 properties")
9. **Consider search context** to determine page limits
10. **Handle edge cases** (no results, single page, many pages)

---

## 📊 Example: Complete Search Implementation

```typescript
class RepliersSearchService {
  private aggregateCache = new Map();
  private CACHE_TTL = 3600000; // 1 hour
  
  async searchProperties(userCriteria: any) {
    console.log('🔍 Starting Repliers search:', userCriteria);
    
    // Step 1: Get market intelligence
    const aggregates = await this.getCachedAggregates(
      userCriteria.city,
      userCriteria.state
    );
    console.log('📊 Market has:', {
      propertyTypes: Object.keys(aggregates.details.propertyType),
      totalProperties: aggregates.count
    });
    
    // Step 2: Map user criteria to API parameters
    const apiParams = this.mapToAPIParams(userCriteria, aggregates);
    console.log('🔧 Mapped parameters:', apiParams);
    
    // Step 3: Determine pagination strategy
    const maxPages = this.calculateMaxPages(userCriteria, aggregates);
    console.log(`📄 Will fetch up to ${maxPages} pages`);
    
    // Step 4: Execute comprehensive search
    const results = await this.fetchWithPagination(apiParams, maxPages);
    console.log(`✅ Retrieved ${results.listings.length}/${results.total} properties`);
    
    // Step 5: Post-process and rank results
    const ranked = this.rankResults(results.listings, userCriteria);
    
    return {
      properties: ranked,
      metadata: {
        totalAvailable: results.total,
        retrieved: results.listings.length,
        pagesScanned: results.pagesRetrieved,
        searchTime: results.duration
      }
    };
  }
  
  private async getCachedAggregates(city: string, state: string) {
    const key = `${city}_${state}`;
    const cached = this.aggregateCache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('📦 Using cached aggregates');
      return cached.data;
    }
    
    console.log('🌐 Fetching fresh aggregates');
    const params = new URLSearchParams({
      city,
      state,
      aggregates: 'details.propertyType,details.style,listPrice',
      listings: 'false'  // Performance optimization
    });
    
    const response = await fetch(`${REPLIERS_API}/listings?${params}`);
    const data = await response.json();
    
    this.aggregateCache.set(key, {
      data: data.aggregates,
      timestamp: Date.now()
    });
    
    return data.aggregates;
  }
  
  private mapToAPIParams(userCriteria: any, aggregates: any) {
    // Use aggregates to map user-friendly values to API values
    const params: any = {
      status: 'A',  // Active
      type: 'Sale',
      city: userCriteria.city,
      state: userCriteria.state
    };
    
    // Map property type using actual API values
    if (userCriteria.propertyType) {
      const available = Object.keys(aggregates.details.propertyType);
      const match = available.find(type => 
        type.toLowerCase().includes(userCriteria.propertyType.toLowerCase())
      );
      if (match) params.propertyType = match;
    }
    
    // Add other parameters
    if (userCriteria.maxPrice) params.maxPrice = userCriteria.maxPrice;
    if (userCriteria.minBedrooms) params.minBedrooms = userCriteria.minBedrooms;
    
    return params;
  }
  
  private async fetchWithPagination(params: any, maxPages: number) {
    const startTime = Date.now();
    const allListings: any[] = [];
    
    // Fetch first page
    const firstPage = await this.fetchPage(params, 1);
    allListings.push(...firstPage.listings);
    
    const totalPages = Math.min(firstPage.numPages, maxPages);
    
    // Fetch remaining pages in parallel
    if (totalPages > 1) {
      const pagePromises = [];
      for (let page = 2; page <= totalPages; page++) {
        pagePromises.push(this.fetchPage(params, page));
      }
      
      const additionalPages = await Promise.all(pagePromises);
      additionalPages.forEach(page => {
        allListings.push(...page.listings);
      });
    }
    
    return {
      listings: allListings,
      total: firstPage.count,
      pagesRetrieved: totalPages,
      duration: Date.now() - startTime
    };
  }
  
  private async fetchPage(params: any, pageNum: number) {
    const queryParams = new URLSearchParams({
      ...params,
      pageNum: pageNum.toString(),
      resultsPerPage: '100'
    });
    
    const response = await fetch(`${REPLIERS_API}/listings?${queryParams}`, {
      headers: {
        'REPLIERS-API-KEY': process.env.REPLIERS_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    return response.json();
  }
}
```

---

## 🚀 Next Steps

1. **Immediate**: Fix pagination to retrieve all Worcester properties
2. **Short-term**: Implement aggregate-based parameter validation
3. **Medium-term**: Add intelligent caching layer
4. **Long-term**: Build ML model for result ranking based on user preferences

---

*This strategy ensures comprehensive, efficient, and accurate property searches using the Repliers API.*
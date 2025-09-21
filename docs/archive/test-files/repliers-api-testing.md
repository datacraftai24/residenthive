# Repliers API Testing Documentation

## Test Results Summary

### Key Findings:
1. **Property Type Filter Issue**: When `propertyType=Single Family Residence` is used, it returns 0 results
2. **State Format**: Both "Massachusetts" and "MA" work, but "MA" is preferred
3. **Restrictive Features**: Parameters like `kitchenQuality=excellent` and `minGarageSpaces=1` severely limit results

## Test 1: Original Full Prompt with All Features

### NLP Request:
```json
{
  "prompt": "Find a 3-bedroom single-family home with 2+ bathrooms in Quincy, Massachusetts under $700,000 with a modern kitchen and garage"
}
```

### NLP Response:
```json
{
  "request": {
    "url": "https://api.repliers.io/listings?propertyType=Single Family Residence&minBeds=3&minBaths=2&city=Quincy&state=Massachusetts&maxPrice=700000&minGarageSpaces=1&kitchenQuality=excellent",
    "body": {
      "imageSearchItems": [
        {
          "type": "text",
          "value": "modern kitchen",
          "boost": 1
        }
      ]
    }
  }
}
```

### Search Result: **0 listings**

## Test 2: Simple Location Search

### NLP Request:
```json
{
  "prompt": "all properties in Quincy MA"
}
```

### NLP Response:
```json
{
  "request": {
    "url": "https://api.repliers.io/listings?city=Quincy&state=MA",
    "body": null
  }
}
```

### Search Result: **308 listings** (includes rentals and sales)

## Test 3: Single Family Homes for Sale

### NLP Request:
```json
{
  "prompt": "single family homes for sale in Quincy MA"
}
```

### NLP Response:
```json
{
  "request": {
    "url": "https://api.repliers.io/listings?propertyType=Single Family Residence&type=sale&city=Quincy&state=MA",
    "body": null
  }
}
```

### Search Result: **0 listings** (propertyType filter is the issue)

## Test 4: Homes for Sale (No Property Type)

### NLP Request:
```json
{
  "prompt": "homes for sale in Quincy MA under 700000"
}
```

### NLP Response:
```json
{
  "request": {
    "url": "https://api.repliers.io/listings?type=sale&city=Quincy&state=MA&maxPrice=700000",
    "body": null
  }
}
```

### Search Result: **75 listings**

## Recommendations for Better Search Results

1. **Avoid "Single Family Residence" property type** - Use generic terms like "homes" instead
2. **Simplify feature requirements** - Don't mention garage, kitchen quality, etc. in the initial search
3. **Use state abbreviations** - "MA" instead of "Massachusetts"
4. **Start broad, filter later** - Get all results first, then filter client-side

## Optimal Prompt Patterns

### Good Prompts:
- "homes for sale in Quincy MA under 700000"
- "3+ bedroom homes in Quincy MA"
- "properties in Quincy MA between 400000 and 600000"

### Problematic Prompts:
- "single-family home" → Returns 0 results
- "with garage and modern kitchen" → Too restrictive
- "must have excellent kitchen quality" → Overly specific

// Demo Investment Analysis with Enhanced Aggregates-Based Property Discovery
// Shows the complete multi-agent system with investment-focused property targeting

import { InvestmentPropertyMapper } from './investment-property-mapper';

interface DemoProperty {
  id: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  style: string;
  squareFeet: number;
  units: number;
  listingDate: string;
}

// Demo data representing realistic multi-family investment properties in Massachusetts
// Based on actual market data patterns for 2-4 unit properties
const DEMO_INVESTMENT_PROPERTIES: DemoProperty[] = [
  {
    id: 'inv001',
    address: '45 Oak Street, Worcester, MA',
    price: 389000,
    bedrooms: 6,
    bathrooms: 3,
    propertyType: 'Multi Family',
    style: '3 Family',
    squareFeet: 2800,
    units: 3,
    listingDate: '2025-08-01'
  },
  {
    id: 'inv002', 
    address: '128 Elm Avenue, Springfield, MA',
    price: 295000,
    bedrooms: 4,
    bathrooms: 2,
    propertyType: 'Multi Family',
    style: '2 Family - 2 Units Up/Down',
    squareFeet: 2200,
    units: 2,
    listingDate: '2025-07-28'
  },
  {
    id: 'inv003',
    address: '67 Pine Road, Lowell, MA',
    price: 445000,
    bedrooms: 8,
    bathrooms: 4,
    propertyType: 'Multi Family',
    style: '4 Family',
    squareFeet: 3600,
    units: 4,
    listingDate: '2025-08-03'
  },
  {
    id: 'inv004',
    address: '92 Maple Drive, Fall River, MA',
    price: 325000,
    bedrooms: 6,
    bathrooms: 3,
    propertyType: 'Multi Family', 
    style: '3 Family - 3 Units Up/Down',
    squareFeet: 2650,
    units: 3,
    listingDate: '2025-07-30'
  },
  {
    id: 'inv005',
    address: '156 Cedar Lane, New Bedford, MA',
    price: 278000,
    bedrooms: 4,
    bathrooms: 2,
    propertyType: 'Multi Family',
    style: '2 Family - 2 Units Side By Side',
    squareFeet: 2100,
    units: 2,
    listingDate: '2025-08-02'
  }
];

export function analyzeDemoInvestmentProperties(budget: number, targetUnits: number = 2) {
  console.log('\n🏠 ENHANCED INVESTMENT PROPERTY ANALYSIS');
  console.log('==========================================');
  console.log(`💰 Budget: $${budget.toLocaleString()}`);
  console.log(`🎯 Target Units: ${targetUnits}+`);
  
  // Use the enhanced investment mapper
  const optimalStyles = InvestmentPropertyMapper.getOptimalPropertyStyles(budget, targetUnits);
  console.log(`📊 Optimal Property Styles: ${optimalStyles.join(', ')}`);
  
  // Filter properties by budget and target units
  const affordableProperties = DEMO_INVESTMENT_PROPERTIES
    .filter(prop => prop.price <= budget && prop.units >= targetUnits)
    .map(prop => ({
      ...prop,
      investmentScore: InvestmentPropertyMapper.getInvestmentScore(prop.style),
      expectedUnits: InvestmentPropertyMapper.getExpectedUnits(prop.style),
      capRate: calculateCapRate(prop),
      cashFlow: calculateCashFlow(prop, budget),
      roi: calculateROI(prop, budget)
    }))
    .sort((a, b) => b.investmentScore - a.investmentScore);

  console.log('\n🎯 TOP INVESTMENT OPPORTUNITIES:');
  console.log('================================');
  
  affordableProperties.slice(0, 3).forEach((prop, index) => {
    console.log(`\n${index + 1}. ${prop.address}`);
    console.log(`   💵 Price: $${prop.price.toLocaleString()}`);
    console.log(`   🏠 Style: ${prop.style} (${prop.units} units)`);
    console.log(`   📊 Investment Score: ${prop.investmentScore}/100`);
    console.log(`   💰 Cap Rate: ${prop.capRate.toFixed(2)}%`);
    console.log(`   💸 Monthly Cash Flow: $${prop.cashFlow.toFixed(0)}`);
    console.log(`   📈 ROI: ${prop.roi.toFixed(1)}%`);
    console.log(`   📐 ${prop.squareFeet.toLocaleString()} sq ft | ${prop.bedrooms} bed / ${prop.bathrooms} bath`);
  });

  return affordableProperties;
}

function calculateCapRate(property: DemoProperty): number {
  // Estimate rental income: $800-1200 per unit per month in Massachusetts markets
  const monthlyRentPerUnit = property.units <= 2 ? 1000 : 900; // Larger units typically lower per-unit rent
  const annualRent = property.units * monthlyRentPerUnit * 12;
  return (annualRent / property.price) * 100;
}

function calculateCashFlow(property: DemoProperty, budget: number): number {
  const downPayment = property.price * 0.25; // 25% down
  const loanAmount = property.price - downPayment;
  const monthlyPayment = (loanAmount * 0.07) / 12; // 7% interest rate estimate
  
  const monthlyRentPerUnit = property.units <= 2 ? 1000 : 900;
  const monthlyRent = property.units * monthlyRentPerUnit;
  const monthlyExpenses = monthlyRent * 0.35; // 35% for taxes, insurance, maintenance
  
  return monthlyRent - monthlyPayment - monthlyExpenses;
}

function calculateROI(property: DemoProperty, budget: number): number {
  const downPayment = property.price * 0.25;
  const annualCashFlow = calculateCashFlow(property, budget) * 12;
  return (annualCashFlow / downPayment) * 100;
}

// Run the demo analysis
if (require.main === module) {
  console.log('🚀 RUNNING ENHANCED INVESTMENT PROPERTY ANALYSIS DEMO');
  analyzeDemoInvestmentProperties(500000, 2);
}
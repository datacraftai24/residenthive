#!/usr/bin/env python3
import json

with open('/Users/piyushtiwari/residenthive/evaluation-logs/evaluation-2025-09-14T04-23-31-692Z.json', 'r') as f:
    data = json.load(f)
    
for result in data.get('evaluationResults', []):
    if result.get('address') == '17 Thenius St':
        print('17 THENIUS ST METRICS')
        print('=' * 60)
        
        # Basic property info
        print(f'\nProperty Details:')
        print(f'  Address: {result.get("address")}')
        print(f'  Price: ${result.get("price"):,}')
        print(f'  Property Type: {result.get("propertyType")}')
        print(f'  Bedrooms: {result.get("bedrooms")}')
        print(f'  Bathrooms: {result.get("bathrooms")}')
        
        # Evaluation result
        eval_result = result.get('evaluationResult', {})
        print(f'\nEvaluation Score: {eval_result.get("score")}')
        print(f'Decision: {eval_result.get("decision")}')
        
        # Financial metrics
        metrics = eval_result.get('metrics', {})
        print(f'\nFinancial Metrics:')
        print(f'  Cash Flow: ${metrics.get("cashFlow")}/month')
        print(f'  Cap Rate: {metrics.get("capRate")}%')
        print(f'  ROI: {metrics.get("roi")}%')
        print(f'  Total Units: {metrics.get("units")}')
        
        # Rent breakdown
        breakdown = metrics.get('rentBreakdown', {})
        print(f'\nRent Analysis:')
        print(f'  Total Monthly Rent: ${breakdown.get("totalMonthlyRent")}')
        if breakdown.get("details"):
            print(f'  Unit Mix: {breakdown.get("details")}')
        
        # Unit extraction details
        extraction = result.get('extractedUnits', {})
        if extraction:
            print(f'\nUnit Extraction Details:')
            print(f'  Total Units Extracted: {extraction.get("units")}')
            
            mix_resolution = extraction.get('mix_resolution', {})
            if mix_resolution:
                print(f'  Resolution Source: {mix_resolution.get("source")}')
                print(f'  Review Required: {mix_resolution.get("review_required")}')
                
                final_mix = mix_resolution.get('final_mix', [])
                if final_mix:
                    print(f'  Final Unit Mix:')
                    for unit in final_mix:
                        print(f'    - {unit.get("unit_id")}: {unit.get("label")} (confidence: {unit.get("confidence")})')
        
        # Extraction method used
        print(f'\nExtraction Method: {"ENHANCED" if result.get("useEnhancedExtraction") else "STANDARD"}')
        
        break
else:
    print("17 Thenius St not found in evaluation results")
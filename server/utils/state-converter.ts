/**
 * Utility for converting state names to abbreviations
 * Used across the application to ensure consistent state formatting for Repliers API
 */

export const STATE_ABBREVIATIONS: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY'
};

/**
 * Convert full state names to abbreviations in any text
 * @param text - Text containing state names (e.g., "Quincy, Massachusetts")
 * @returns Text with state names replaced by abbreviations (e.g., "Quincy, MA")
 */
export function convertStateToAbbreviation(text: string): string {
  if (!text) return text;
  
  let result = text;
  
  // Replace full state names with abbreviations
  for (const [fullName, abbr] of Object.entries(STATE_ABBREVIATIONS)) {
    // Use word boundary to avoid partial matches
    const regex = new RegExp(`\\b${fullName}\\b`, 'gi');
    result = result.replace(regex, abbr);
  }
  
  return result;
}

/**
 * Check if a string contains a full state name that needs conversion
 * @param text - Text to check
 * @returns true if text contains a full state name
 */
export function containsFullStateName(text: string): boolean {
  if (!text) return false;
  
  for (const fullName of Object.keys(STATE_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${fullName}\\b`, 'i');
    if (regex.test(text)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get state abbreviation from full name
 * @param stateName - Full state name
 * @returns State abbreviation or original input if not found
 */
export function getStateAbbreviation(stateName: string): string {
  // Direct lookup (case insensitive)
  const normalizedName = stateName.trim();
  for (const [fullName, abbr] of Object.entries(STATE_ABBREVIATIONS)) {
    if (fullName.toLowerCase() === normalizedName.toLowerCase()) {
      return abbr;
    }
  }
  
  // Return original if not found (might already be an abbreviation)
  return stateName;
}